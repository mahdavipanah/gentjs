#! /usr/bin/env node

var path = require('path');
var fs = require('fs');
var format = require('util').format;

var mkdirp = require('mkdirp');
var deasync = require('deasync');


var configFile = 'gentjs.json';
var customConfig = false;
// Try load the .gentest.js config file
try {
    // Custom config file
    if (process.argv.length > 2 && process.argv[2][0] !== '-') {
        configFile = process.argv[2];
        customConfig = true;
    }

    // Make sure config file address is absolute
    if (!path.isAbsolute(configFile))
        configFile = path.join(process.cwd(), configFile);

    // Read gentjs.json file
    var config = fs.readFileSync(
        configFile, {
            encoding: 'UTF-8'
        }
    );

} catch (e) {
    console.error("Cannot find '%s' file.", customConfig ? process.argv[2] : configFile);
    process.exit(1);
}


var CWD = path.dirname(configFile);


// Parse the config file's content
try {
    config = JSON.parse(config);
} catch (e) {
    console.error(
        "Error in parsing '%s' json file:\n\n%s",
        customConfig ? process.argv[2] : configFile,
        e
    );
    process.exit(1);
}


// Run test command
if (process.argv.slice(2).includes('--run')) {
    try {
        var Mocha = require(path.join(CWD, 'node_modules/mocha/'));
    } catch (e) {
        try {
            var Mocha = require('mocha');
        } catch (e) {
            console.error("Error in loading mocha. Please install mocha in config file's directory or globally.");
            process.exit(1);
        }
    }

    var mocha = new Mocha({
        ui: 'tdd'
    });

    // Add test code pathes to mocha
    if (Array.isArray(config.functions))
        config.functions.forEach(function(fn) {
            var fnDir = path.join(CWD, fn.directory === undefined ? config.directory : '' + fn.directory);
            // Function's test case code path
            var fnCodePath = path.join(fnDir, fn.file === undefined ? fn.name + '.js' : '' + fn.file);

            mocha.addFile(fnCodePath);
        });

    var data = null;
    var done = false;
    mocha.run(function(failures) {
        data = failures;
        done = true;
    });

    deasync.loopWhile(function() {
        return !done;
    });

    process.exit(data);
}


var overwrite = false;
if (process.argv.length > 2) {
    var argvSlice = process.argv.slice(customConfig ? 3 : 2);
    overwrite = argvSlice.includes('-o');
    if (!overwrite)
        overwrite = argvSlice.includes('--overwrite');
}


// Check if there is an array of functions defined in config file
if (!Array.isArray(config.functions))
    process.exit(0);


var typeMap = null;
// If custom type module is specified
if (config.customTypes) {
    try {
        typeMap = require(path.join(CWD, String(config.customTypes)));
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND')
            console.error("'%s' customTypes file does not exists.");
        else
            console.error("'%s' customTypes file loading error:\n\n%s", e);

        process.exit(1);
    }
} else {
    typeMap = {
        'str': [null, undefined, 'foo bar', 'FOO BAR', 113, 23.23, '', '   ', '\n\n\t\r'],
        'char': [null, undefined, '', ' ', 'foo bar', 'a', 'A', 113, 23.23],
        'bool': [null, undefined, true, false, '', 113, 23.23],
        'num': function(param) {
            var params = [];

            // If min is defined
            if (param.min !== undefined) {
                // Check if min is a valid number
                if (isNaN(param.min = Number(param.min)))
                    throw "'num'.'min' is not a number";
                params.push(param.min - 1, param.min, param.min + 1);
            }

            // If max is defined
            if (param.max !== undefined) {
                // Check if max is a valid number
                if (isNaN(param.max = Number(param.max)))
                    throw "'num'.'max' is not a number";
                params.push(param.max - 1, param.max, param.max + 1);
            }

            // Check if mid is defined
            if (param.mid === undefined)
                throw "'num'.'mid' is not defined";
            // Check if mid is a valid number
            if (isNaN(param.mid = Number(param.mid)))
                throw "'num'.'mid' is not a number";
            params.push(param.mid);

            return params;
        }
    };
}


// Check if directory config is defined
if (config.directory === undefined)
    config.directory = 'tests';
else
    // Convert it to string
    config.directory += '';


// Check if indent config is defined
if (config.indent === undefined)
    config.indent = 2;
config.indent = ' '.repeat(config.indent);


if (config.moduleDirectory !== undefined)
    // Convert it to string
    config.moduleDirectory += '';


config.functions.forEach(function(fn) {
    // Check if functions has module property
    if (fn.module !== undefined) {
        fn.module += '';
    }
    // Check if functions has name property
    if (!fn.name) {
        console.error("All functions must have 'name' property.");
        process.exit(1);
    } else {
        // Convert it to string
        fn.name += '';
    }
    // Check if function's param property is defined
    if (fn.params === undefined) {
        console.error("'%s' must have 'params' property.", fn.module);
        process.exit(1);
    }
    // Check if function's params property is an array
    if (!Array.isArray(fn.params)) {
        console.error("'%s' params property must be an array.", fn.module);
        process.exit(1);
    }

    var testCases = [];

    function cartesianProduct(arr) {
        // There is only one set
        if (arr.length === 1)
            return arr[0].map(JSON.stringify);

        var result = [];
        arr[0].forEach(function(item) {
            item = JSON.stringify(item);

            cartesianProduct(arr.slice(1)).forEach(function(other) {
                result.push(item + ', ' + other);
            });
        });
        return result;
    }

    var params = [];
    for (var i = 0; i < fn.params.length; i++) {
        var param = fn.params[i];

        if (typeof param === 'object') {
            // Check if param has type property
            if (param.type === undefined) {
                console.error(
                    "'%s'  function's '%s' param property must have type property",
                    fn.module,
                    param
                );
                process.exit(1);
            }
            // Check if param type is defined
            if (!typeMap.hasOwnProperty(param.type)) {
                console.error(
                    "'%s' function's '%s' param type is unknown.",
                    fn.module,
                    param.type
                );
                process.exit(1);
            }
            // Check if param type is an object definable type
            if (typeof typeMap[param.type] !== 'function') {
                console.error(
                    "'%s' function's '%s' param type is not object definable.",
                    fn.module,
                    param.type
                );
                process.exit(1);
            }

            var returnedParams = null;
            try {
                returnedParams = typeMap[param.type](param);
            } catch (e) {
                console.error(
                    "'%s' function's '%s' param type %s.",
                    fn.module,
                    param.type,
                    e
                );
                process.exit(1);
            }

            params.push(returnedParams);
            continue;
        }

        // Check if param is a defined type
        if (!typeMap.hasOwnProperty(param)) {
            console.error(
                "'%s' function's '%s' param type is unknown.",
                fn.module,
                param
            );
            process.exit(1);
        }

        params.push(typeMap[param]);
    }
    if (fn.params.length)
        testCases = testCases.concat(cartesianProduct(params));
    else
        testCases.push('');


    // Path of module to be loaded inside test source code
    var moduleAddr = fn.module;

    if (fn.module === undefined && config.moduleDirectory === undefined)
        moduleAddr = path.join(CWD, fn.name);
    else if (config.moduleDirectory !== undefined)
        moduleAddr = path.join(config.moduleDirectory, fn.name);

    var fnDir = path.join(CWD, fn.directory === undefined ? config.directory : '' + fn.directory);

    moduleAddr = path.relative(
        fnDir,
        moduleAddr
    );

    var testCode = "var equal = require('assert').equal;\n" +
        format("var %s = require('%s')", fn.name, moduleAddr) +
        (fn.export !== undefined ? '.' + fn.export : '') + ";\n\n\n" +
        format("test('#%s', function() {\n", fn.name);

    testCases.forEach(function(testCase) {
        testCode += config.indent + format(
            "equal(%s(%s), /* Expected value */);\n",
            fn.name,
            testCase
        );
    });

    testCode += '});\n';

    // Create directory if not exists
    if (!fs.existsSync(fnDir))
        mkdirp.sync(fnDir);

    // Function's test case code path
    var fnCodePath = path.join(fnDir, fn.file === undefined ? fn.name + '.js' : '' + fn.file);

    // Check if the file exists
    if (fs.existsSync(fnCodePath))
        if (!overwrite) {
            console.warn("WARNING: File '%s' already exists. Use '-o' too overwrite.", path.relative(process.cwd(), fnCodePath));
            return;
        }

    fs.writeFileSync(fnCodePath, testCode);
});
