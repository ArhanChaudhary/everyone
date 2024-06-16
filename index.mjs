import { Octokit } from "octokit";

const MIN_FOLLOWERS = 500;
const NUM_CO_AUTHORS = 10_000;

const octokit = new Octokit({
  auth: process.env.GH_PAT,
});

async function deriveUserEmail(username) {
  let [name, { data: events }] = await Promise.all([
    octokit
      .request("GET /users/{username}", {
        username,
      })
      .then(
        ({ data: { name } }) =>
          name || Promise.reject(username + ": No name found")
      ),
    octokit.request("GET /users/{username}/events/public", {
      username,
      per_page: 10,
    }),
  ]);

  let email;
  JSON.stringify(events, (_, jsObject) => {
    if (jsObject?.email && jsObject?.name === name)
      email = jsObject.email;
    return jsObject;
  });
  return email || Promise.reject(username + ": No email found");
}

async function* allCoAuthors() {
  let usersIterator = octokit.paginate.iterator(octokit.rest.search.users, {
    q: "followers:>=" + MIN_FOLLOWERS,
    sort: "followers",
    per_page: 100,
  });

  for await (const { data: users } of usersIterator) {
    console.log("NEW PAGE");
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
      } else {
        console.error(reason);
      }
    }
  }
}

console.log("👀");
console.log();
let num_co_authors = NUM_CO_AUTHORS;
for await (const coAuthor of allCoAuthors()) {
  if (num_co_authors-- <= 0) {
    break;
  }
  console.log(coAuthor);
}
