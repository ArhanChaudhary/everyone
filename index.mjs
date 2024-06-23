import { stripIgnoredCharacters } from "graphql/utilities/stripIgnoredCharacters.js";
import { Octokit } from "octokit";

// I don't account for duplicate co-authors nor do I validate them so
// you should overestimate this value by a factor of around 1.5
const CO_AUTHOR_COUNT = 146_000;
const BATCH_USER_COUNT = 85;
const ONLY_NOREPLY_EMAILS = true;
const INITIAL_SEARCH_MAX_FOLLOWERS = Infinity;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
  throttle: {
    onRateLimit: (retryAfter, options, octokit) => {
      console.warn(
        `[WARNING] Request quota exhausted for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        let now = new Date();
        now.setSeconds(now.getSeconds() + retryAfter);
        console.warn(
          `[WARNING] Retrying after ${retryAfter} seconds: ${now.toISOString()}`
        );
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      console.warn(
        `[WARNING] SecondaryRateLimit detected for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        let now = new Date();
        now.setSeconds(now.getSeconds() + retryAfter);
        console.warn(
          `[WARNING] Retrying after ${retryAfter} seconds: ${now.toISOString()}`
        );
        return true;
      }
    },
  },
});

function emailsFromUsersQuery(users) {
  return stripIgnoredCharacters(`
    {
      ${users
        .map(
          ({ login, id }, index) =>
            `_${index}: user(login: "${login}") {
              repositories(first: 1, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
                nodes {
                  defaultBranchRef {
                    target {
                      ... on Commit {
                        history(first: 1, author: { id: "${id}" }) {
                          nodes {
                            author {
                              email
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }`
        )
        .join("\n")}
    }
  `);
}

async function* coAuthorsFromUsersIterator(usersBatch) {
  let emails;
  let query = emailsFromUsersQuery(usersBatch.slice(0, BATCH_USER_COUNT));
  try {
    emails = await octokit.graphql(query);
  } catch (e) {
    console.error(
      `[ERROR] Error deriving emails for query ${query}: ${e.toString()}`
    );
    usersBatch.fill(null, 0, BATCH_USER_COUNT);
    return;
  }
  // happened one time for some strange reason
  if (!emails) {
    console.warn(
      `[WARNING] Emails is unexpectedly ${emails} from query ${query}`
    );
    usersBatch.fill(null, 0, BATCH_USER_COUNT);
    return;
  }

  for (let [i, jsonWithEmail] of Object.entries(emails)) {
    let email =
      jsonWithEmail.repositories.nodes[0]?.defaultBranchRef?.target.history
        .nodes[0]?.author.email;
    i = i.substring(1);
    // null indicates user was processed and should be removed from the batch
    if (
      email &&
      (!ONLY_NOREPLY_EMAILS || email.endsWith("@users.noreply.github.com"))
    ) {
      let user = usersBatch[i];
      usersBatch[i] = null;
      yield `Co-authored-by: ${user.login} <${email}>`;
    } else {
      usersBatch[i] = null;
    }
  }
}

async function* userFollowersCoAuthorIterator(rootUser, usersBatch) {
  let rootUserFollowersIterator = octokit.graphql.paginate.iterator(
    stripIgnoredCharacters(`
      query($cursor: String) {
        user(login: "${rootUser.login}") {
          followers(first: 100, after: $cursor) {
            nodes {
              login
              id
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `)
  );

  let usersCount = 0;
  while (usersCount < FOLLOWERS_PER_SEARCH_USER) {
    for (let i = usersBatch.length - 1; i >= 0; i -= 1) {
      if (usersBatch[i] === null) {
        usersBatch.splice(i, 1);
      }
    }
    // if there are still followwers to be processed from the previous user
    // i know it messes up usersCount but thats still fine as it yields the
    // exact amount of co-authors
    if (usersBatch.length < BATCH_USER_COUNT) {
      try {
        for await (let jsonWithFollowers of rootUserFollowersIterator) {
          usersBatch.push(...jsonWithFollowers.user.followers.nodes);
          if (usersBatch.length >= BATCH_USER_COUNT) {
            break;
          }
        }
        if (usersBatch.length < BATCH_USER_COUNT) {
          console.warn(
            `[WARNING] Only processed ${usersBatch.length}/${FOLLOWERS_PER_SEARCH_USER} followers from user ${rootUser.login}`
          );
          return;
        }
      } catch (e) {
        console.error(
          `[ERROR] Error fetching followers for ${
            rootUser.login
          }: ${e.toString()}`
        );
        return;
      }
    }
    for await (let coAuthor of coAuthorsFromUsersIterator(usersBatch)) {
      yield coAuthor;
      usersCount++;
    }
  }
}

async function* searchUsersIterator(searchMaxFollowers) {
  let _searchUsersIterator = octokit.graphql.paginate.iterator(
    stripIgnoredCharacters(`
      query($cursor: String) {
        search(query: "${
          searchMaxFollowers === Infinity
            ? "followers:>=0"
            : `followers:<${searchMaxFollowers}`
        }", type: USER, first: 100, after: $cursor) {
          nodes {
            ... on User {
              login
              id
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
  `)
  );
  try {
    for await (let jsonWithSearchUsers of _searchUsersIterator) {
      for (let searchUser of jsonWithSearchUsers.search.nodes) {
        if (Object.keys(searchUser).length !== 0) {
          yield searchUser;
        }
      }
    }
  } catch (e) {
    console.error(`[ERROR] Error fetching search users: ${e.toString()}`);
  }
}

async function* coAuthorsIterator() {
  // I know... but this needs to be sequential or else github complains
  // about secondary rate limits
  let usersBatch = [];
  let searchMaxFollowers = INITIAL_SEARCH_MAX_FOLLOWERS;
  let minFollowersLogin;
  while (true) {
    for await (let searchUser of searchUsersIterator(searchMaxFollowers)) {
      console.warn(
        `[INFO] Processing followers for ${searchUser.login} at ${Math.round(
          (new Date() - start) / 1000
        )} seconds in`
      );
      minFollowersLogin = searchUser.login;
      for await (let coAuthor of userFollowersCoAuthorIterator(
        searchUser,
        usersBatch
      )) {
        yield coAuthor;
      }
    }
    if (minFollowersLogin) {
      // if this fails, tough luck
      ({
        user: {
          followers: { totalCount: searchMaxFollowers },
        },
      } = await octokit.graphql(
        stripIgnoredCharacters(`
          {
            user(login: "${minFollowersLogin}") {
              followers {
                totalCount
              }
            }
          }
        `)
      ));
    }
  }
}

const FOLLOWERS_PER_SEARCH_USER = Math.ceil(Math.sqrt(CO_AUTHOR_COUNT));
let coAuthorCount = 0;
let start = new Date();
console.log("👀\n");
for await (let coAuthor of coAuthorsIterator()) {
  console.log(coAuthor);
  if (++coAuthorCount >= CO_AUTHOR_COUNT) {
    break;
  }
}
if (coAuthorCount < CO_AUTHOR_COUNT) {
  console.warn(
    `[WARNING] Only processed ${coAuthorCount}/${CO_AUTHOR_COUNT} co-authors`
  );
}
console.warn(`\nDone in ${Math.round((new Date() - start) / 1000)} seconds!`);
