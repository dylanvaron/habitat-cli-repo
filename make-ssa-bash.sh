#!/usr/bin/env bash

echo "Starting..."

habitat resource give ferrite 90
habitat resource give silicate-glass 45
habitat resource give conductive-ore 18
habitat module set-status workshop-fabricator-1 active
habitat module set-status supply-cache-1 online
habitat construct --blueprint-id small-solar-array --name "Small Solar Array"
habitat tick 180
habitat module set-status workshop-fabricator-1 offline
habitat module set-status supply-cache-1 offline

echo "Complete"
