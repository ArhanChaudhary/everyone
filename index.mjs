import { Octokit } from "octokit";

const NUM_CO_AUTHORS = Infinity;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
  throttle: {
    onRateLimit: (retryAfter, options, octokit) => {
      console.warn(
        `Request quota exhausted for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        let now = new Date();
        now.setSeconds(now.getSeconds() + retryAfter);
        console.warn(
          `Retrying after ${retryAfter} seconds: ${now.toISOString()}`
        );
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      console.warn(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        let now = new Date();
        now.setSeconds(now.getSeconds() + retryAfter);
        console.warn(
          `Retrying after ${retryAfter} seconds: ${now.toISOString()}`
        );
        return true;
      }
    },
  },
});

async function* allCoAuthors() {
  let usersIterator = octokit.paginate.iterator(octokit.rest.search.users, {
    q: `followers:>=${minFollowers}`,
    sort: "followers",
    order: "asc",
    per_page: 100,
  });

  for await (let { data: users } of usersIterator) {
    if (users.length === 0) {
      continue;
    }
    mostFollowersLogin = users[users.length - 1].login;
    users = users.filter(({ type }) => type === "User");

    for (let { login, email } of users) {
      if (email) {
        yield `Co-authored-by: ${login} <${email}>`;
      }
    }

    // TODO: what else do I call this!?
    let bigChungus = `
    {
      ${users
        .map(
          ({ login, node_id: nodeId }, index) =>
            `user${index}: user(login: "${login}") {
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
    }`;

    for (let [i, jsonWithEmail] of Object.values(
      await octokit.graphql(bigChungus)
    ).entries()) {
      let email =
        jsonWithEmail.repositories.nodes[0]?.defaultBranchRef?.target.history
          .nodes[0]?.author.email;
      if (email) {
        yield `Co-authored-by: ${users[i].login} <${email}>`;
      }
    }
  }
}

let numCoAuthors = NUM_CO_AUTHORS;
let minFollowers = 0;
let mostFollowersLogin;

console.log("👀\n");
outer: while (true) {
  console.warn(`Searching for users with >=${minFollowers} followers`);
  for await (let coAuthor of allCoAuthors()) {
    if (numCoAuthors-- <= 0) {
      break outer;
    }
    console.log(coAuthor);
  }
  // most followers
  if (mostFollowersLogin === "torvalds") {
    break;
  }
  let {
    data: { followers },
  } = await octokit.request("GET /users/{username}", {
    username: mostFollowersLogin,
  });
  minFollowers = Math.max(minFollowers, followers) + 1;
}
console.warn("Done!");
