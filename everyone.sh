#!/bin/bash

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
cat results.txt | awk '!seen[$0]++' | split -l 5000 -a 10 - split
FIRST_ITERATION=1
for i in split*
do
    if [ $FIRST_ITERATION -eq 0 ]; then
        sleep 3
    fi
    FIRST_ITERATION=0
    printf '👀\n\n%s' $(cat $i) | git commit --allow-empty -F -
done

rm split*
echo "Co-authors ssuccessfully processed!"
