#!/usr/bin/env node
import { Command } from "commander";
import { checkbox, confirm, select } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";

// Scaffold smoke check: proves the four libraries resolve and type-check
// under NodeNext. Replaced by the real CLI in step 5.
export const libraries = { Command, checkbox, confirm, select, chalk, ora };
