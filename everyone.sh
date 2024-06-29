#!/bin/bash



# Copyright 2024, Arhan Chaudhary, All rights reserved.
#
# Hey there, curious reader
#
# This program is *solely* meant for educational purposes. I love making
# my software public, but I kindly request for you to be mindful and avoid
# misuse relating to email harvesting/spamming.
#
# Please familiarize yourself with GitHub's Acceptable Use Policies on:
#
# Impersonation https://docs.github.com/en/site-policy/acceptable-use-policies/github-impersonation
# Spam and Inauthentic Activity https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#4-spam-and-inauthentic-activity-on-github
# Information Usage Restrictions https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#7-information-usage-restrictions
# API Terms https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms
# Excessive Bandwidth Use https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#9-excessive-bandwidth-use
#
# And make sure your use of information complies with the GitHub Privacy Statement:
#
# https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
#
# Thank you!



if [ -z "$GH_PAT" ]; then
    echo "You need a GitHub Personal Access Token to run this script"
    echo "Set it as the environment variable GH_PAT"
    exit 1
fi

# check if results.txt exists
if [ ! -f results.txt ]; then
    echo "Results file not found! Before this script, you first need to run:"
    echo
    echo "  node index.mjs --co-author-count=[N] > results.txt 2> log.txt"
    echo
    echo "On your local machine to generate the results file"
    echo "Alternatively, you can nohup the command on a virtual machine:"
    echo
    echo "  nohup ... &"
    echo
    exit 1
fi

echo "Results file found"
echo "Warning: this script will create and push commits"
echo "Warning: enter anything to continue or Ctrl+C to cancel"
read
echo "Starting postprocessing, please wait for a while..."
# we must batch contributors 5000 at a time and also sleep for two minutes
# or else github refuses to process them
split -l 5000 -a 5 results.txt split_
FIRST_ITERATION=1
for i in split_*
do
    if [ $FIRST_ITERATION -eq 0 ]; then
        sleep 120
    fi
    FIRST_ITERATION=0
    echo -e "👀\n\n$(cat $i)" | git commit --allow-empty -F -
    git push
done

rm split_*
echo "Co-authors successfully processed!"
