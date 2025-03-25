#!/usr/bin/env node

import {program} from "commander";
import fs from "fs";
import run from "./src/run.js";

program
  .command('init')
  .alias('i')
  .description('项目初始化工具')
  .action(name => {
    fs.stat('./.autotinyrc.json', err => {
      if(err){
        fs.writeFileSync('./.autotinyrc.json', JSON.stringify({
          keys: [
            "***",
          ],
          imgPatterns: [
            "./public/*"
          ],
          watermark: "tiny"
        },null, 2))
      }
    });
  });
program
  .command('run')
  .alias('r')
  .description('执行图片压缩')
  .action(() => {
    run();
  });

program
  .option('-l, --log', '是否显示日志', false)
  .parse(process.argv);