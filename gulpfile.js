const gulp = require("gulp");
const through2 = require("through2");
const yaml = require("js-yaml");
const Datastore = require("nedb");
const cb = require("cb");
const mergeStream = require("merge-stream");
const clean = require("gulp-clean");
const zip = require("gulp-zip");
const fs = require("fs");
const path = require("path");

const MODULE = JSON.parse(fs.readFileSync("template.json"));
const STATIC_FILES = ["template.json", "src/assets/**/*"];
const PACK_SRC = "src/packs";
const BUILD_DIR = "build";
const DIST_DIR = "dist";

/* ----------------------------------------- */
/*  Compile Compendia
/* ----------------------------------------- */

function compilePacks() {
  // determine the source folders to process
  const folders = fs.readdirSync(PACK_SRC).filter((file) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  // process each folder into a compendium db
  const packs = folders.map((folder) => {
    const db = new Datastore({ filename: path.resolve(__dirname, BUILD_DIR, "packs", `${folder}.db`), autoload: true });
    return gulp.src(path.join(PACK_SRC, folder, "/**/*.yml")).pipe(
      through2.obj((file, enc, cb) => {
        let json = yaml.loadAll(file.contents.toString());
        db.insert(json);
        cb(null, file);
      })
    );
  });
  return mergeStream.call(null, packs);
}

/* ----------------------------------------- */
/*  Copy static files
/* ----------------------------------------- */

function copyFiles() {
  return gulp
    .src(STATIC_FILES, {
      base: "src",
    })
    .pipe(gulp.dest(BUILD_DIR));
}

/* ----------------------------------------- */
/*  Create distribution archive
/* ----------------------------------------- */

function createZip() {
  return gulp
    .src(`${BUILD_DIR}/**/*`)
    .pipe(zip(`foundryvtt-${MODULE.name}-v${MODULE.version}.zip`))
    .pipe(gulp.dest(DIST_DIR));
}

const SYSTEM_SCSS = ["scss/**/*.scss"];
function compileScss() {
  // Configure options for sass output. For example, 'expanded' or 'nested'
  let options = {
    outputStyle: 'expanded'
  };
  return gulp.src(SYSTEM_SCSS)
    .pipe(
      sass(options)
        .on('error', handleError)
    )
    .pipe(prefix({
      cascade: false
    }))
    .pipe(gulp.dest("./css"))
}
const css = gulp.series(compileScss);

/* ----------------------------------------- */
/*  Other Functions
/* ----------------------------------------- */

function cleanBuild() {
  return gulp.src(`${BUILD_DIR}`, { allowEmpty: true }, { read: false }).pipe(clean());
}

function watchUpdates() {
  gulp.watch("src/**/*", gulp.series(cleanBuild, copyFiles, compilePacks));
  gulp.watch(SYSTEM_SCSS, css);
}

/* ----------------------------------------- */
/*  Export Tasks
/* ----------------------------------------- */

exports.clean = gulp.series(cleanBuild);
exports.compile = gulp.series(compilePacks);
exports.copy = gulp.series(copyFiles);
exports.build = gulp.series(cleanBuild, copyFiles, compilePacks);
exports.dist = gulp.series(createZip);
exports.css = css;
exports.default = gulp.series(cleanBuild, copyFiles, compilePacks, watchUpdates);
