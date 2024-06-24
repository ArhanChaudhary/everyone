<!-- cspell:ignore ethicality noreply arhan docstrings -->

# To concerned readers, and GitHub staff

Please navigate to the [ethicality and legality](#ethicality-and-legality) section if you have concerns about data privacy regarding this repository.

# ... What

Your eyes don't deceive you. This repository has exactly 100,000 contributors!

Though, you probably see a number close to 99,986 contributors. This is because the rest are represented by 14 icons right above that number. In the case that you see a bit less than 99,986 contributors, I think it's because changing email addresses can cause the exact number to fluctuate.

# ... How

As you could probably guess, 100,000 people didn't actually contribute to this repository. I accidentally discovered some time ago that if you co-author a GitHub user on a commit, they're unconditionally and permanently added as a contributor to the repository. I wrote a script that utilizes the GitHub GraphQL API to collect and co-author GitHub users on commits on this repository.

Check out `everyone.sh` and `index.mjs`. Make sure you read their docstrings and understand the implications of personal use.

# ... Why

[Why not? Why not? Why not?](https://github.com/mame/quine-relay/issues/11)

# Ethicality and legality

The primary reason for the inclusion of this section is the fact that you need to include a GitHub user's name **and email address** in a commit message for them to be listed as a contributor for this repository.

**Please be aware that this repository primarily contains "users.noreply.github.com" private email addresses that are only valid within GitHub.** In essence, most of the email addresses hosted by this repository cannot be used for email harvesting or spamming purposes. Please also be aware that a small amount of real email addresses were committed at the beginning, but only for testing purposes. I believe that this amount is small enough to be insignificant and inconsequential.

I have thoroughly read through GitHub's Acceptable Use Policies on [Impersonation](https://docs.github.com/en/site-policy/acceptable-use-policies/github-impersonation), [Spam and Inauthentic Activity](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#4-spam-and-inauthentic-activity-on-github), [Information Usage Restrictions](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#7-information-usage-restrictions), [API Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms), and [Excessive Bandwidth Use](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#9-excessive-bandwidth-use). I am not a lawyer by any means, but I believe this repository complies wth these regulations. I hope you can understand that I take privacy very seriously and that my intentions are nothing more than educational.

**If you still have concerns regarding this repository, please email me at "arhan[dot]ch[at]gmail[dot]com"**
