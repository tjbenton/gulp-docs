# gulp-docs

 Generates a JSON file of your documents. It uses an enhanced version of DSS to do this.

 Since the stream returns a JSON file it allows you to determin what you want to do with it. You can output the JSON file or pair it with nunjucks or another template compiler.

 Personally I use angularjs and just use it as a data file because it's much easer that way.

## Options

- `fileName`
  Changes the json file name
- `parsers`
  This allows you to add your own custom parsers


# Examples

For the following examples assume that this is at the top of the `gulp.js` file

```js
var gulp = require("gulp"), // loads gulp
    $ = require("gulp-load-plugins")({ // loads all the plugins
     pattern: 'gulp-*',
     replaceString: 'gulp-',
     camelize: true,
     lazy: true
    });
```


###### Simplest

This will output a `docs.json` file and put it in `docs/`

```js
gulp.task("docs", function(){
 return gulp.src("lib/scss/**/*.scss")
         .pipe($.docs())
         .pipe(gulp.dest("docs"));
});
```

###### With options

This will output a `documentation.json` file and put it in `docs/` and state

```js
gulp.task("docs", function(){
 return gulp.src("lib/scss/**/*.scss")
         .pipe($.docs({
           fileName: "documentation",
           parsers: {
            // @state :hover - When the button is hovered over.
            state: function(i, line, block, file, endOfBlock){
             var values = line.split(' - '),
                 states = (values[0]) ? (values[0].replace(":::", ":").replace("::", ":")) : "";
             return {
               name: states,
               escaped: states.replace(":", " :").replace(".", " ").trim(),
               description: (values[1]) ? values[1].trim() : ""
             };
            }
           }
          }))
         .pipe(gulp.dest("docs"));
});
```