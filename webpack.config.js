var HtmlPlugin = require('html-webpack-plugin');

module.exports = {
    entry: "./app.js",
    output: {
        path: __dirname + '/public',
        filename: "bundle.js",
        sourcePrefix: ''
    },
    plugins: [
        new HtmlPlugin({
            template: 'index.html',
            inject: true
        })
    ],
    devServer: {
        contentBase: './public',
    },
    module: {
        unknownContextCritical: false,
        loaders: [{
                test: /\.jsx?$/,
                loaders: ['babel'],
                exclude: /node_modules/,
                include: __dirname
            },
            { test: /\.css$/, loader: "style!css" }, {
                test: /\.(png|gif|jpg|jpeg)$/,
                loader: 'file-loader'
            }
        ]
    }
};
