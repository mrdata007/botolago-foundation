#!/bin/bash
# usage: mkpost.sh <suffix> : post<suffix> = copy of pre<suffix> + batch migrations
Q=/tmp/r3pg/q
N=$1
$Q -Atc "select pg_terminate_backend(pid) from pg_stat_activity where datname='pre$N' and pid<>pg_backend_pid()" >/dev/null
$Q -q -c "drop database if exists post$N with (force)" -c "create database post$N template pre$N"
/tmp/r3pg/applybatch.sh post$N
