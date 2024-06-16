import { Octokit } from "@octokit/core";

const minFollowers = 500;
const perPage = 100;
const pages = 5;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
});

async function deriveUserEmail(username) {
  let { data: userRepos } = await octokit.request(
    `GET /users/{username}/repos`,
    {
      username,
    }
  );
  let targetRepo = userRepos
    .filter(({ fork }) => !fork)
    .reduce((acc, repo) => {
      if (repo.stargazers_count > acc.stargazers_count) {
        return repo;
      } else {
        return acc;
      }
    });
  if (!targetRepo) {
    return Promise.reject(username + ": No target repo found");
  }
  let { data: commits } = await octokit.request(
    `GET /repos/{owner}/{repo}/commits`,
    {
      owner: username,
      repo: targetRepo.name,
      author: username,
      per_page: 5,
    }
  );
  let emails = commits.map(
    ({
      commit: {
        author: { email },
      },
    }) => email
  );

  let email = emails.find((email) => email);
  if (!email) {
    return Promise.reject(username + ": No email found");
  }
  return email;
}

async function pageUserInfo(page) {
  let {
    data: { items: users },
  } = await octokit.request("GET /search/users", {
    q: "followers:>=" + minFollowers,
    sort: "followers",
    order: "desc",
    per_page: perPage,
    page,
  });

  users = users.filter(({ type }) => type === "User");
  let allCoAuthors = await Promise.allSettled(
    users.map(async ({ login: username, email }) => {
      if (!email) {
        email = await deriveUserEmail(username);
      }
      return `${username} <${email}>`;
    })
  );

  return allCoAuthors
    .filter(
      ({ status, reason }) => status === "fulfilled" || console.log(reason)
    )
    .map(({ value }) => "Co-authored-by: " + value);
}

let pageUsersInfoPromises = [];

for (let i = 1; i <= pages; i++) {
  pageUsersInfoPromises.push(pageUserInfo(i));
}

let pagesUserInfo = (await Promise.all(pageUsersInfoPromises)).flat();

console.log("👀");
console.log();
console.log(pagesUserInfo.join("\n"));
