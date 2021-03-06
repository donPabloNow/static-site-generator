#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import {createServer} from "http";
import WebSocket from "ws";
import {program} from "commander";
const {version} = require("../package.json");

import * as staticSiteGenerator from ".";

const PORT = 3000;
const WS_PORT = 3001;

program.version(version, "-v, --version");
program
  .option("--src-dir <path>", "source directory for files")
  .option("-d, --build-dir <path>", "build directory for files")
  .option("--static-dir <path>", "directory for static files")
  .option("--log-level <level>", "how much information to log", parseInt)
  .option("--compression-level <level>", "how much to compress files", parseInt)
  .parse(process.argv);

if(program.srcDir){
  staticSiteGenerator.options.staticDir = path.join(path.resolve(program.srcDir), staticSiteGenerator.options.staticDir.split(staticSiteGenerator.options.srcDir)[1]);
  staticSiteGenerator.options.srcDir = path.resolve(program.srcDir);
}
if(program.buildDir){
  staticSiteGenerator.options.buildDir = path.resolve(program.buildDir);
}
if(program.staticDir){
  staticSiteGenerator.options.staticDir = path.join(staticSiteGenerator.options.srcDir, path.resolve(program.staticDir));
}
if(program.logLevel !== undefined && program.logLevel !== NaN){
  staticSiteGenerator.options.logLevel = program.logLevel;
}
if(program.compressionLevel !== undefined && program.compressionLevel !== NaN){
  staticSiteGenerator.options.compressionLevel = program.compressionLevel;
}

switch(process.argv[2]){
  case "watch": {
    staticSiteGenerator.build();
    staticSiteGenerator.log.info("watching files for changes...");

    const changed = (event: any, file: string) => {
      try{
        staticSiteGenerator.build();
      }catch(err){
        staticSiteGenerator.log.error(err);
      }
    };

    fs.watch(staticSiteGenerator.options.srcDir, changed);
    staticSiteGenerator.recurseDirectory(staticSiteGenerator.options.srcDir, undefined, (dir) => {
      fs.watch(dir, changed);
    });
  } break;
  case "dev": {
    staticSiteGenerator.log.info("starting dev server...");

    const wss = new WebSocket.Server({port: WS_PORT});
    wss.on("connection", (ws) => {
      staticSiteGenerator.log.success("new WS connection");
    });

    const changed = (event: any, file: string) => {
      wss.clients.forEach((client) => {
        client.send("reload");
      });
    };

    fs.watch(staticSiteGenerator.options.srcDir, changed);
    staticSiteGenerator.recurseDirectory(staticSiteGenerator.options.srcDir, undefined, (dir) => {
      fs.watch(dir, changed);
    });

    createServer((req, res) => {
      let url = `${req.url}`.slice(1);
      if(`${req.url}`.endsWith("/")){
        url += "index.html";
      }

      const filePath = path.join(staticSiteGenerator.options.srcDir, url);
      const staticPath = path.join(staticSiteGenerator.options.staticDir, url);

      if(fs.existsSync(staticPath) && !fs.lstatSync(staticPath).isDirectory()){
        staticSiteGenerator.log.success(`serving static file ${url}`);
        res.write(fs.readFileSync(staticPath));
        res.end();
      }else if(filePath.endsWith(".html")){
        const filePaths = {
          ejs: `${filePath.substring(0, filePath.length - 4)}ejs`,
          moe: `${filePath.substring(0, filePath.length - 4)}moe`
        };

        const file = fs.existsSync(filePaths.ejs) ? filePaths.ejs : fs.existsSync(filePaths.moe) ? filePaths.moe : "404";
        if(file === "404"){
          res.write("404 not found");
          res.end();
          return;
        }

        staticSiteGenerator.renderPage(file, staticSiteGenerator.getData(), (html) => {
          let normalDoc = false;
          if(html.endsWith("</body></html>")){
            normalDoc = true;
            html = html.substring(0, html.length - "</body></html>".length);
          }

          html += `<script>var ssgs=new WebSocket("ws://localhost:${WS_PORT}");ssgs.onmessage=function(event){if(event.data==="reload"){window.location.reload()}}</script>`;

          if(normalDoc){
            html += "</body></html>";
          }

          res.write(html);
          res.end();
        });
      }else{
        res.write("404 not found");
        res.end();
      }
    }).listen(PORT, () => {
      staticSiteGenerator.log.success(`dev server running at http://localhost:${PORT}`);
    });
  } break;
  default:
    staticSiteGenerator.build();
    break;
}
