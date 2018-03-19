var HtmlPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './app.js',
    output: {
        path: __dirname + '/dist',
        filename: 'bundle.js',
        publicPath: '/cesium-elevation-gradient/',
        sourcePrefix: ''
    },
    plugins: [
        new HtmlPlugin({
            template: 'index.html',
            inject: true
        })
    ],
    devServer: {
        contentBase: './dist',
    },
    module: {
        unknownContextCritical: false,
        rules: [
            {
                test: /\.(glsl|vs|fs)$/,
                use: {
                    loader: 'shader-loader'
                }
            }, {
                test: /\.jsx?$/,
                use: {
                    loader: 'babel-loader'
                },
                exclude: /node_modules/,
                include: __dirname
            },
            { 
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader'
                ]
            }, {
                test: /\.(png|gif|jpg|jpeg)$/,
                use: {
                    loader: 'file-loader'
                }
            }
        ]
    }
};
