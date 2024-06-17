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

async function deriveUserEmail(username) {
  let { data: repos } = await octokit.request("GET /users/{username}/repos", {
    username,
    per_page: 100,
  });

  let repo = repos.reduce((acc, repo) => {
    if (!repo.fork && (!acc || repo.stargazers_count > acc.stargazers_count)) {
      return repo;
    } else {
      return acc;
    }
  }, undefined);

  if (!repo) {
    return Promise.reject(username + ": No target repo found");
  }

  let { data: commits } = await octokit.request(
    "GET /repos/{owner}/{repo}/commits",
    {
      owner: username,
      repo: repo.name,
      author: username,
      per_page: 1,
    }
  );

  return (
    commits?.[0]?.commit.author?.email ||
    Promise.reject(username + ": No email found")
  );
}

async function* allCoAuthors() {
  let usersIterator = octokit.paginate.iterator(octokit.rest.search.users, {
    q: `followers:>=${minFollowers}`,
    sort: "followers",
    order: "asc",
    per_page: 100,
  });

  for await (let { data: users } of usersIterator) {
    if (users.length !== 0) {
      mostFollowersUsername = users[users.length - 1].login;
    }
    for (let { login: username, email, type } of users) {
      if (type !== "User") {
        continue;
      }
      try {
        yield `Co-authored-by: ${username} <${
          email || (await deriveUserEmail(username))
        }>`;
      } catch (e) {
        if (
          !(typeof e === "string") &&
          e.message !==
            "Git Repository is empty. - https://docs.github.com/rest/commits/commits#list-commits"
        ) {
          console.warn(e);
        }
      }
    }
  }
}

let numCoAuthors = NUM_CO_AUTHORS;
let minFollowers = 0;
let mostFollowersUsername;

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
  if (mostFollowersUsername === "torvalds") {
    break;
  }
  let {
    data: { followers },
  } = await octokit.request("GET /users/{username}", {
    username: mostFollowersUsername,
  });
  minFollowers = Math.max(minFollowers, followers) + 1;
}
console.warn("Done!");
