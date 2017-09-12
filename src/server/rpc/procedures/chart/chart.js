const ApiConsumer = require('../utils/api-consumer');
const rpcUtils = require('../utils');
const Logger = require('../../../logger');
const logger = new Logger('netsblox:rpc:chart');
const gnuPlot = require('./node-gnuplot.js');
const _ = require('lodash');
const Q = require('q');

let chart = new ApiConsumer('chart');

const defaults = {
    title: undefined,
    labels: [],
    types: [],
    xRange: undefined,
    yRange: undefined,
    xLabel: undefined,
    yLabel: undefined,
    timeSeriesAxis: undefined,
    timeInputFormat: '%s',
    timeOutputFormat: '%d/%m'
}

function prepareData(lines, lineTitles, lineTypes){
    return lines.map((pts, idx) => {
        // shouldn't be needed! Temp fix
        if (!Array.isArray(pts)) {
            logger.warn(`input is not an array!`);
            pts = _.map(pts, function(value, index) {
                return value;
            });
        }
        let lineObj = {points: pts};
        if (lineTypes) lineObj.type = lineTypes[idx];
        if (lineTitles) lineObj.title = lineTitles[idx];
        return lineObj;
    });
}

chart.draw = function(lines, options){
    options = rpcUtils.kvListToJson(options);
    console.log('passed options', options);
    options = _.merge({}, defaults, options || {});
    console.log('merged options', options);

    let data = prepareData(lines, options.labels, options.types);
    
    let opts = {title: options.title, type: options.type, xLabel: options.xLabel, yLabel: options.yLabel};
    if (options.xRange) opts.xRange = {min: options.xRange[0], max: options.xRange[1]};
    if (options.yRange) opts.yRange = {min: options.yRange[0], max: options.yRange[1]};
    let chartStream =  gnuPlot.draw(data, opts);
    return rpcUtils.collectStream(chartStream).then( buffer => {
        rpcUtils.sendImageBuffer(this.response, buffer, logger);
    }).catch(logger.error);
};

chart.timeSeries = function(lines, labels, title, xRange, yRange, xLabel, yLabel, timeInputFormat, timeOutputFormat){

    let data = prepareData(lines, labels);

    timeInputFormat = timeInputFormat || '%s';
    timeOutputFormat = timeOutputFormat || '%d/%m';
    
    let opts = {title: title, xLabel, yLabel, timeSeries: {}};
    if (xRange) opts.xRange = {min: xRange[0], max: xRange[1]};
    if (yRange) opts.yRange = {min: yRange[0], max: yRange[1]};
    opts.timeSeries = {
        axis: 'x',
        inputFormat: timeInputFormat,
        outputFormat: timeOutputFormat
    };
    let chartStream =  gnuPlot.draw(data, opts);
    return rpcUtils.collectStream(chartStream, logger).then( buffer => {
        rpcUtils.sendImageBuffer(this.response, buffer, logger);
    }).catch(logger.error);
};

chart.defaultOptions = function(){
    return rpcUtils.jsonToSnapList(defaults);
}

module.exports = chart;
