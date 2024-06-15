import { Octokit } from "@octokit/core";

const minFollowers = 1000;
// const coAuthorsNum = 10;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
});

let { data: users } = await octokit.request("GET /users", {
  q: "followers:>=" + minFollowers,
  ref: "searchresults",
  s: "followers",
  type: "Users",
});

async function getFormattedUserInfo(user) {
  // return Promise.resolve("hello " + username);
  let username = user.login;
  let { data: userRepos } = await octokit.request(
    `GET /users/{username}/repos`,
    {
      username,
    }
  );
  let targetRepo = userRepos.find(({ fork }) => !fork);
  if (!targetRepo) {
    return Promise.reject();
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
    return Promise.reject();
  }
  let email = targetCommit.commit.author.email;
  if (!email || email.includes("noreply.github.com")) {
    return Promise.reject();
  }
  return `${username} <${email}>`;
}

let allCoAuthors = await Promise.allSettled(users.map(getFormattedUserInfo));

allCoAuthors = allCoAuthors
  .filter(({ status }) => status === "fulfilled")
  .map(({ value }) => "Co-authored-by: " + value);

console.log("👀");
console.log();
console.log(allCoAuthors.join("\n"));
