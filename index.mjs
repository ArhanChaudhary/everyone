import { stripIgnoredCharacters } from "graphql/utilities/stripIgnoredCharacters.js";
import { Octokit } from "octokit";

const CO_AUTHOR_COUNT = 135_000;
const FOLLOWERS_PER_SEARCH_USER = 250;
const BATCH_USER_COUNT = 100;
const ONLY_NOREPLY_EMAILS = true;

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
          ({ login, node_id: nodeId }, index) =>
            `_${index}: user(login: "${login}") {
              repositories(first: 1, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
                nodes {
                  defaultBranchRef {
                    target {
                      ... on Commit {
                        history(first: 1, author: { id: "${nodeId}" }) {
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

  for (let [i, jsonWithEmail] of Object.entries(emails)) {
    let email =
      jsonWithEmail.repositories.nodes[0]?.defaultBranchRef?.target.history
        .nodes[0]?.author.email;
    // null indicates user was processed and should be removed from the batch
    i = i.substring(1);
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
  let rootUserFollowersIterator = octokit.paginate.iterator(
    octokit.rest.users.listFollowersForUser,
    { username: rootUser.login, per_page: 100 }
  );

  let usersCount = 0;
  while (true) {
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
        for await (let { data: someUsers } of rootUserFollowersIterator) {
          usersBatch.push(...someUsers);
          if (usersBatch.length >= BATCH_USER_COUNT) {
            break;
          }
        }
        if (usersBatch.length < BATCH_USER_COUNT) {
          // out of followers, next user
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
      if (++usersCount >= FOLLOWERS_PER_SEARCH_USER) {
        return;
      }
    }
  }
}

async function* coAuthorsIterator() {
  // I know... but this needs to be sequential or else github complains
  // about secondary rate limits
  let usersBatch = [];
  // if the pagination throws an error... tough luck
  // octokit anyways retries once by default
  for await (let { data: searchUsers } of octokit.paginate.iterator(
    octokit.rest.search.users,
    {
      q: "followers:>=0",
      sort: "followers",
      per_page: 100,
    }
  )) {
    for (let searchUser of searchUsers) {
      console.warn(`[INFO] Processing followers for ${searchUser.login}`);
      for await (let coAuthor of userFollowersCoAuthorIterator(
        searchUser,
        usersBatch
      )) {
        yield coAuthor;
      }
    }
  }
}

let coAuthorCount = 0;
let start = new Date();
console.log("👀\n");
for await (let coAuthor of coAuthorsIterator()) {
  console.log(coAuthor);
  if (++coAuthorCount >= CO_AUTHOR_COUNT) {
    break;
  }
}
console.warn(`Done in ${Math.round((new Date() - start) / 1000)} seconds!`);
