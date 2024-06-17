import { Octokit } from "octokit";

const NUM_CO_AUTHORS = 100_000;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
  throttle: {
    onRateLimit: (retryAfter, options, octokit) => {
      console.error(
        `Request quota exhausted for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        const now = new Date();
        now.setSeconds(now.getSeconds() + retryAfter);
        console.error(
          `Retrying after ${retryAfter} seconds: ${now.toISOString()}`
        );
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      console.error(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        const now = new Date();
        now.setSeconds(now.getSeconds() + retryAfter);
        console.error(
          `Retrying after ${retryAfter} seconds: ${now.toISOString()}`
        );
        return true;
      }
    },
  },
});

async function deriveUserEmail(username) {
  let { data: events } = await octokit.request(
    "GET /users/{username}/events/public",
    {
      username,
      per_page: 100,
    }
  );

  let emailCounts = {};
  let maxEmail;
  let maxEmailCount = 0;
  JSON.stringify(events, (_, jsObject) => {
    let email = jsObject?.email;
    if (email && jsObject.name) {
      emailCounts[email] = (emailCounts[email] || 0) + 1;
      if (emailCounts[email] > maxEmailCount) {
        maxEmail = email;
        maxEmailCount = emailCounts[email];
      }
    }
    return jsObject;
  });

  return maxEmail || Promise.reject(username + ": No email found");
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
    let someCoAuthors = await Promise.allSettled(
      users
        .filter(({ type }) => type === "User")
        .map(
          async ({ login: username, email }) =>
            `${username} <${email || (await deriveUserEmail(username))}>`
        )
    );
    for (let { value: coAuthor, reason } of someCoAuthors) {
      if (coAuthor) {
        yield "Co-authored-by: " + coAuthor;
      } else if (!reason.includes("No email found")) {
        console.error(reason);
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
