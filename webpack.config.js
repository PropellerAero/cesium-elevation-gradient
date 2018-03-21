const path = require('path');

const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// The path to the cesium source code
const cesiumSource = 'node_modules/cesium';
const cesiumWorkers = '../cesium/Build/Cesium/Workers';

module.exports = [{
    context: __dirname,
    entry: {
        app: './app.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),

        // Needed by Cesium for multiline strings
        sourcePrefix: ''
    },
    amd: {
        // Enable webpack-friendly use of require in cesium
        toUrlUndefined: true
    },
    node: {
        // Resolve node module use of fs
        fs: "empty"
    },
    resolve: {
        alias: {
            // Cesium module name
            cesium: path.resolve(__dirname, cesiumSource)
        }
    },
    module: {
        rules: [{
            test: /\.jsx?$/,
            use: {
                loader: 'babel-loader'
            },
            exclude: /node_modules/,
            include: __dirname
        },{
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        }, {
            test: /\.(png|gif|jpg|jpeg|svg|xml|json)$/,
            use: ['url-loader']
        }, {
            test: /\.(glsl|vs|fs)$/,
            use: {
                loader: 'shader-loader'
            }
        }]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html'
        }),
        // Copy Cesium Assets, Widgets, and Workers to a static directory
        new CopyWebpackPlugin([{from: path.join(cesiumSource, '../cesium/Build/Cesium/Workers'), to: 'Workers'}]),
        new CopyWebpackPlugin([{from: path.join(cesiumSource, '../cesium/Source/Assets'), to: 'Assets'}]),
        new CopyWebpackPlugin([{from: path.join(cesiumSource, '../cesium/Source/Widgets'), to: 'Widgets'}]),
        new webpack.DefinePlugin({
            // Define relative base path in cesium for loading assets
            CESIUM_BASE_URL: JSON.stringify('')
        }),
        // Split cesium into a seperate bundle
        new webpack.optimize.CommonsChunkPlugin({
            name: 'cesium',
            minChunks: function (module) {
                return module.context && module.context.indexOf('cesium') !== -1;
            }
        })
    ],

    // development server options
    devServer: {
        contentBase: path.join(__dirname, "dist")
    }
}];