fs = require "fs"
Server = require __dirname+"/server.js"

class @App
  constructor:()->
    @config =
      realm: "local"

    fs.readFile "../config.json",(err,data)=>
      if not err
        @config = JSON.parse(data)
        console.info "config.json loaded"
      else
        console.info "No config.json file found, running local with default settings"

      fs.readFile "../config-ai.json",(aiErr,aiData)=>
        if not aiErr
          try
            aiConfig = JSON.parse(aiData)
            @config.ai_gateway = aiConfig.gateway or aiConfig.ai_gateway or aiConfig
            console.info "config-ai.json loaded"
          catch parseErr
            console.info "could not parse config-ai.json"
        else
          console.info "No config-ai.json file found, using AI gateway defaults"

        @server = new Server(@config)

module.exports = new @App()
