import { Octokit } from "octokit";

const MIN_FOLLOWERS = 500;
const USERS_PER_PAGE = 100;
const PAGE_COUNT = 3;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
});

async function deriveUserEmail(username) {
  let { data: userRepos } = await octokit.request(
    "GET /users/{username}/repos",
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
    "GET /repos/{owner}/{repo}/commits",
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
    q: "followers:>=" + MIN_FOLLOWERS,
    sort: "followers",
    per_page: USERS_PER_PAGE,
    page,
  });

  users = users.filter(({ type }) => type === "User");
  let allCoAuthors = await Promise.allSettled(
    users.map(
      async ({ login: username, email }) =>
        `${username} <${email || (await deriveUserEmail(username))}>`
    )
  );

  return allCoAuthors
    .filter(({ value, reason }) => value || console.error(reason))
    .map(({ value }) => "Co-authored-by: " + value);
}

let pageUsersInfoPromises = [];

for (let i = 1; i <= PAGE_COUNT; i++) {
  pageUsersInfoPromises.push(pageUserInfo(i));
}

let pagesUserInfo = (await Promise.all(pageUsersInfoPromises)).flat();

console.log("👀");
console.log();
console.log(pagesUserInfo.join("\n"));
