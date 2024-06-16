import { Octokit } from "octokit";

const NUM_CO_AUTHORS = 10_000;
const FOLLOWERS_START = 50;
const FOLLOWERS_END = 4000;

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
    if (jsObject?.email && jsObject?.name === name) email = jsObject.email;
    return jsObject;
  });
  return email || Promise.reject(username + ": No email found");
}

async function* allCoAuthors(minFollowers) {
  let usersIterator = octokit.paginate.iterator(octokit.rest.search.users, {
    q: `followers:>=${minFollowers}`,
    sort: "followers",
    order: "asc",
    per_page: 100,
  });

  for await (let { data: users } of usersIterator) {
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

function randRange(start, end) {
  return Math.floor(Math.random() * (end - start) + start);
}

let numCoAuthors = NUM_CO_AUTHORS;
let minFollowers;
console.log("👀");
console.log();
outer: while (true) {
  let newMinFollowers = randRange(FOLLOWERS_START, FOLLOWERS_END);
  while (
    minFollowers === undefined ||
    Math.abs(newMinFollowers - minFollowers) < 50
  ) {
    newMinFollowers = randRange(FOLLOWERS_START, FOLLOWERS_END);
  }
  minFollowers = newMinFollowers;
  for await (const coAuthor of allCoAuthors(minFollowers)) {
    if (numCoAuthors-- <= 0) {
      break outer;
    }
    console.log(coAuthor);
  }
}
console.error("\nDone!\n");
