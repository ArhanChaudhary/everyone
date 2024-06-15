import { Octokit } from "@octokit/core";

const minFollowers = 500;
// const coAuthorsNum = 10;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
});

async function userInfo(user) {
  let username = user.login;
  let { data: userRepos } = await octokit.request(
    `GET /users/{username}/repos`,
    {
      username,
    }
  );
  let targetRepo = userRepos.find(({ fork }) => !fork);
  if (!targetRepo) {
    return Promise.reject(username + ": No target repo found");
  }
  let { data: allCommits } = await octokit.request(
    `GET /repos/{owner}/{repo}/commits`,
    {
      owner: username,
      repo: targetRepo.name,
    }
  );
  let targetCommit = allCommits.find(({ author }) => author.login === username);
  if (!targetCommit) {
    return Promise.reject(username + ": No target commit found");
  }
  let email = targetCommit.commit.author.email;
  if (!email || email.includes("noreply.github.com")) {
    return Promise.reject(username + ": No email found");
  }
  return `${username} <${email}>`;
}

async function pageUserInfo(page) {
  let {
    data: { items: users },
  } = await octokit.request("GET /search/users", {
    q: "followers:>=" + minFollowers,
    ref: "searchresults",
    s: "followers",
    type: "Users",
    per_page: 100,
    page,
  });

  let allCoAuthors = await Promise.allSettled(users.map(userInfo));
  return Promise.resolve(
    allCoAuthors
      .filter(
        ({ status, reason }) => status === "fulfilled" || console.log(reason)
      )
      .map(({ value }) => "Co-authored-by: " + value)
  );
}

let pageUsersInfoPromises = [];

for (let i = 1; i <= 5; i++) {
  pageUsersInfoPromises.push(pageUserInfo(i));
}

let pagesUserInfo = (await Promise.all(pageUsersInfoPromises)).flat();

console.log("👀");
console.log();
console.log(pagesUserInfo.join("\n"));
