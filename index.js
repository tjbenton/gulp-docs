'use strict';
var through = require("through"),
    Buffer = require("buffer").Buffer,
    File = require("gulp-util").File,
    path = require("path"),
    dss = require("./dss.js");

function plugin(opts) {
  var firstFile = null,
      data = {
       nav: {},
       pages: {}
      };

  // @note - This adds the custom parsers from the template
  for(var key in opts.parsers){
   dss.parsers[key] = opts.parsers[key];
  }

  function process(file){
   var parseOptions = {},
       fullPath = file.path.replace(file.cwd, "~"),
       fileName = fullPath.match(/(?!\/)[^\/\s]*\.\w*/)[0];
   // @note - This parses all of the files that are passed to gulp-dss
   dss.parse(file.contents.toString(), parseOptions, function(dssFile){
    firstFile = firstFile || file;

    // @note - If the dssFile doesn't have any valid comment blocks it will skip that file
    if(dssFile.blocks.length === 0) return;

    // @note - This loops over each block in the dssFile
    dssFile.blocks.filter(validBlock).forEach(function(block){
     if(block.arg){
      block.arg = toArray(block.arg); // turns block.arg into an array

      // gets the helper peices.
      var code = block.arg[0].helper,
          // js regex for functions
          // /(?:var\s)?(.*)(?:\s?(?:=|:)\s?)function(?:\((.*)\))|function\s(.*)(?:\((.*)\))/
          sassHelperRegex = /\@(function|mixin)\s([^(\s]*)(?:\((.*)(?:\)(?=\s*?\{|\s*?\n)))/,
          helper = code.match(sassHelperRegex),
          fullHelper = helper[0] ? helper[0] + "{ ... }" : "Hey stupid define a function or mixin", // first line of the function or mixin
          helperType = helper[1] ? helper[1] : "Needs to be a function or mixin", // function or mixin
          helperName = helper[2] ? helper[2] : "Need to specify a name", // name of the function or mixn
          helperArgs = helper[3] ? helper[3].replace(/(\(.*)(,\s?)(.*\))/, "$1#{comma}$3").split(",") : ""; // the helpers arguments

      // removes the helper
      block.arg.forEach(function(obj){
       delete obj.helper
      });

      // Adds the argument names and default values.
      // Example: $argument: "default value";
      if(helperArgs !== ""){
       for(var i = 0; i < helperArgs.length; i++){
        var blankArg = {
                        name: "",
                        type: "",
                        default: "-",
                        description: "",
                        path: null
                       },
                       values = helperArgs[i].split(":");
        block.arg[i] = block.arg[i] !== undefined ? block.arg[i] : blankArg;

        block.arg[i].name = block.arg[i].name !== "" ? block.arg[i].name : values[0].trim();
        block.arg[i].default = values[1] ? values[1].replace("#{comma}", ", ").trim() : "-";
       }
      }

      // Adds the helper object to the block
      block.helper = {
       escaped: fullHelper,
       path: fullPath
      }

      // If block.name isn't defined then it is set to the helpers name.
      if(!block.name) block.name = helperName;

      // Adds the the functions that aren't default sass functions listed below to the requires section.
      // http://sass-lang.com/documentation/Sass/Script/Functions.html
      var defaultSassFunctions = [
           "rgb", "rgba", "red", "green", "blue", "mix", // RGB Functions
           "hsl", "hsla", "hue", "saturation", "lightness", "adjust-hue", "lighten", "darken", "saturate", "desaturate", "grayscale", "complement", "invert", // HSL Functions
           "alpha", "rgba", "opacify", "transparentize", // Opacity Functions
           "adjust-color", "scale-color", "change-color", "ie-hex-str", // Other Color Functions
           "unquote", "quote", "str-length", "str-insert", "str-index", "str-slice", "to-upper-case", "to-lower-case", // String Functions
           "percentage", "round", "ceil", "floor", "abs", "min", "max", "random", // Number Functions
           "length", "nth", "join", "append", "zip", "index", "list-separator", // List Functions
           "map-get", "map-merge", "map-remove", "map-keys", "map-values", "map-has", "keywords", // Map Functions
           "selector-nest", "selector-append", "selector-extend", "selector-replace", "selector-unify", "is-superselector", "simple-selectors", "selector-parse", // Selector Functions
           "feature-exists", "variable-exists", "global-variable-exists", "function-exists", "mixin-exists", "inspect", "type-of", "unit", "unitless", "comparable", "call", // Introspection Functions
           "if", "unique-id" // Miscellaneous Functions
          ],
          // Pulled from http://css-tricks.com/almanac/ and http://cssvalues.com/
          cssFunctions = [
           // CSS Selectors
           "lang", "matches", "not", "nth-child", "nth-last-child", "nth-last-of-type", "nth-of-type",
           // CSS Properties
           "opacity",
           // `animation-timing-function` and `transition-timing-function` functions
           "cubic-bezier", "steps",
           // `background` functions
           "url", "-moz-linear-gradient", "-webkit-gradient", "color-stop", "-webkit-linear-gradient", "-o-linear-gradient", "-ms-linear-gradient", "linear-gradient", "-moz-radial-gradient", "-webkit-gradient", "-webkit-radial-gradient", "-o-radial-gradient", "-ms-radial-gradient", "radial-gradient", "DXImageTransform.Microsoft.gradient",
           // `clip` and `clip-path` functions
           "rect", "inset", "circle", "ellipse",
           // `content` functions
           "attr", "counter",
           // `filter` functions
           "blur", "brightness", "contrast", "url", "drop-shadow", "grayscale",
           "hue-rotate", "invert", "opacity", "sepia", "custom",
           // `transform` functions
           "translateZ", "translateY", "translateX", "translate3d", "translate", "skewY", "skewX", "scaleZ", "scaleY", "scaleX", "scale3d", "scale", "rotateZ", "rotateY", "rotateX", "rotate3d", "rotate", "perspective", "matrix3d", "matrix"
          ],
          allFunctions = defaultSassFunctions.concat(cssFunctions),
          // This selects all the functions in the inner part of the function or mixin.
          // This gets the inner code and matches all the functions, @extends, and @includes
          innerCode = code.replace(sassHelperRegex, "").match(/(?![\s(),:;{}])[\w\d-.]*(?=\()|\@extend\s*[%#\w\d-.]*(?=;|\n)|\@include\s*.*(?=\()/g),
          addedToRequires = [];

      // Forces block.requires to be an array
      block.requires = block.requires !== undefined ? toArray(block.requires) : [];

      if(innerCode !== null){
       // Loops over each function.
       innerCode.forEach(function(obj){
        if(allFunctions.indexOf(obj) === -1 && block.requires.indexOf(obj + "()") === -1){
         return block.requires.push(obj.indexOf("@extend") > -1 ? obj : obj + "()");
        }
       });
      }

      // Delete block.requires if it empty
      block.requires[0] === undefined && delete block.requires
     } // end block.arg


     if(block.page) block.page = toArray(block.page);
     if(block.requires) block.requires = toArray(block.requires);
     if(block.state) block.state = toArray(block.state);
     if(block.note) block.note = toArray(block.note);


     if(block.todo){
      block.todo = toArray(block.todo);

      // Adds "todo" to the nav
      data.nav["todo"] = data.nav["todo"] || [];

      // Adds the todo page to pages
      data.pages["todo"] = data.pages["todo"] || {};

      // Adds each todo item to the todoPage object
      block.todo.forEach(function(obj){
       // adds sub nav to todo page.
       !!~data.nav.todo.indexOf(fileName) || data.nav.todo.push(fileName);

       data.pages.todo[fileName] = data.pages.todo[fileName] || {};
       data.pages.todo[fileName]["todo"] = data.pages.todo[fileName]["todo"] || [];
       data.pages.todo[fileName]["todo"].push(obj);
      });
     }

     if(block.markup){
      if(block.markup.lang === "html"){
       block.markup.lang = "markup";
      }
      block.markup = toArray(block.markup);
      // append file path to every markup module.
      block.markup.forEach(function(obj){
       obj.path = fullPath;
      });
     }


     if(block.type){
      block.type.path = fullPath;
      if(!block.name) block.name = block.type.name;
     }


     if(block.page){
      // This creates pages and sections
      for(var i = 0; i < block.page.length; i++){
       // @note {!} - Prevents duplicate pages from being generated.
       var navigation = block.page[i].nav.toLowerCase(),
           section = block.page[i].section.toLowerCase();

       // @note - creates the navigation
       data.nav[navigation] = data.nav[navigation] || [];
       !!~data.nav[navigation].indexOf(section) || data.nav[navigation].push(section);

       // @note
       //  1. Defines the custom page structure as an array if it doesn't exist
       //  2. Defines the section structure as an array if it doesn't exist
       //  3. Pushes the data onto the section inside of the page
       data.pages[navigation] = data.pages[navigation] || {};
       data.pages[navigation][section] = data.pages[navigation][section] ? data.pages[navigation][section] : [];
       data.pages[navigation][section].push(block);

      }
     }else{
      // Adds the "other.html" to the navigation
      data.nav["other"] = data.nav["other"] || [];
      !!~data.nav["other"].indexOf("general") || data.nav["other"].push("general");

      // @description This generates the data for the other page
      data.pages["other"] = data.pages["other"] || {};
      data.pages["other"]["general"] = data.pages["other"]["general"] || [];
      data.pages.other.general.push(block);
     }

    });

    function toArray(obj){
     return obj instanceof Array ? obj : [obj];
    }

    function validBlock(block) {
     return block.name || block.page || block.type !== undefined;
    }

   });
  }

  function endStream(){
   if(firstFile){

    var jsonFile = new File({
         cwd: firstFile.cwd,
         base: firstFile.base,
         path: path.join(firstFile.base, (opts.fileName !== undefined ? opts.fileName : "docs") + ".json"),
         contents: new Buffer(JSON.stringify(data, null, 1))
        });

    this.emit("data", jsonFile);

   }

   this.emit("end");
  }
  return through(process, endStream);
}

module.exports = plugin;