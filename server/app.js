var Server, fs;

fs = require("fs");

Server = require(__dirname + "/server.js");

this.App = (function() {
  function App() {
    this.config = {
      realm: "local"
    };
    fs.readFile("../config.json", (function(_this) {
      return function(err, data) {
        if (!err) {
          _this.config = JSON.parse(data);
          console.info("config.json loaded");
        } else {
          console.info("No config.json file found, running local with default settings");
        }
        return fs.readFile("../config-ai.json", function(aiErr, aiData) {
          if (!aiErr) {
            try {
              var aiConfig;
              aiConfig = JSON.parse(aiData);
              _this.config.ai_gateway = aiConfig.gateway || aiConfig.ai_gateway || aiConfig;
              console.info("config-ai.json loaded");
            } catch (parseErr) {
              console.info("could not parse config-ai.json");
            }
          } else {
            console.info("No config-ai.json file found, using AI gateway defaults");
          }
          return _this.server = new Server(_this.config);
        });
      };
    })(this));
  }

  return App;

})();

module.exports = new this.App();
