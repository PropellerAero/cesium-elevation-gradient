precision mediump float;

// our texture
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform vec2 u_textureSize;
uniform vec2 u_tileDimension;
uniform float u_zFactor;
uniform float u_zenith;
uniform float u_azimuth;
uniform float u_majorContour;
uniform float u_minorContour;
uniform float u_hillshadeAmount;
uniform float u_gradientAmount;
uniform float u_contourAmount;
uniform float u_useSlope;
uniform vec4 u_contourColor;

// external GRADIENT_STOP_COUNT

uniform vec4 u_gradientColors[GRADIENT_STOP_COUNT];
uniform float u_gradientValues[GRADIENT_STOP_COUNT];

varying vec2 v_texCoord;

uniform vec2 u_tileElevationRange;

#define M_PI 3.1415926535897932384626433832795
#define CONTOUR_MAJOR_OPACITY 1.0
#define CONTOUR_MINOR_OPACITY 0.3

vec3 light = vec3(255., 231., 177.) / vec3(255.);
vec3 shade = vec3(3., 152., 255.) / vec3(255.);

vec2 cellsize = u_tileDimension / u_textureSize;

float colourToElevation(vec4 col){
    float range = u_tileElevationRange.y - u_tileElevationRange.x;
    return mix(u_tileElevationRange.x, u_tileElevationRange.y, col.r) + range * col.g / 255.;
}

float getElevation(vec2 coord){
    vec4 col = texture2D(u_image, coord);
    return colourToElevation(col);
}

float calcSlope(float a, float b, float c, float d, float e, float f, float g, float h, float i) {
    float dzdx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * cellsize.x);
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * cellsize.y);
    return atan(sqrt(dzdx * dzdx + dzdy * dzdy)) * 180. / M_PI;
}

float calcHillshade(float a, float b, float c, float d, float e, float f, float g, float h, float i){
    // http://edndoc.esri.com/arcobjects/9.2/net/shared/geoprocessing/spatial_analyst_tools/how_hillshade_works.htm

    float dzdx = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / (8.0 * cellsize.x);
    float dzdy = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / (8.0 * cellsize.y);
    float slope = atan(u_zFactor * sqrt(dzdx * dzdx + dzdy * dzdy));

    float aspect = atan(dzdy, -dzdx);

    if(aspect < 0.0){
        aspect = aspect +  2.0 * M_PI;
    }

    float hillshade = ((cos(u_zenith) * cos(slope)) + (sin(u_zenith) * sin(slope) * cos(u_azimuth - aspect)));
    return clamp(hillshade, 0., 1.);
}

float linstep(float edge0, float edge1, float x){
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float detectEdge(float x, float a, float b){
    return float(x > min(a,b) && x < max(a,b));
}

float calcDistance(float x, float a, float b, float c, float d, float e){
    float s0 = (c - b) * 0.5;
    float s1 = (e - d) * 0.5;
    float s = (abs(s0) + abs(s1)) * 0.5;
    return abs((x-a) / s);
}

float calcContour(float minor, float major, float a, float b, float c, float d, float e, float f, float g, float h, float i){

    float x = floor(e * (1.0 / minor) + 0.5) * minor; // nearest contour

    float isMajor = float(mod(x, major) < 0.01);
    float isMinor = (1.0 - isMajor);

    // a b c
    // d e f
    // g h i

    float dist = calcDistance(x, e, d, f, b, h);
    float result = linstep(2.0, 0.5, dist);

    result *= CONTOUR_MAJOR_OPACITY * isMajor + CONTOUR_MINOR_OPACITY * isMinor;

    return clamp(result, 0., 1.);
}

vec3 applyTint(float hillshade) {
    return mix(shade, light, hillshade) * hillshade * 1.2;
}

vec3 applyGamma(vec3 col){
    return clamp(pow(col, vec3(0.8)), vec3(0.), vec3(1.));
}

// Useful for debugging
float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec4 calcGradientColour(float e){
    if(e <= u_gradientValues[0]){
        return u_gradientColors[0];
    }

    for(int i = 1; i < GRADIENT_STOP_COUNT; ++i){
        if(e <= u_gradientValues[i]){
            float a = (e - u_gradientValues[i-1]) / (u_gradientValues[i] - u_gradientValues[i-1]);
            return mix(u_gradientColors[i-1], u_gradientColors[i], a);
        }
    }

    return u_gradientColors[GRADIENT_STOP_COUNT-1];
}

void main() {
    vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;

    vec4 maskColour = texture2D(u_mask, v_texCoord);
    float maskValue = maskColour.a;

    float a = getElevation(v_texCoord + onePixel * vec2(-1.0, -1.0));
    float b = getElevation(v_texCoord + onePixel * vec2( 0.0, -1.0));
    float c = getElevation(v_texCoord + onePixel * vec2( 1.0, -1.0));
    float d = getElevation(v_texCoord + onePixel * vec2(-1.0,  0.0));
    float e = getElevation(v_texCoord + onePixel * vec2( 0.0,  0.0));
    float f = getElevation(v_texCoord + onePixel * vec2( 1.0,  0.0));
    float g = getElevation(v_texCoord + onePixel * vec2(-1.0,  1.0));
    float h = getElevation(v_texCoord + onePixel * vec2( 0.0,  1.0));
    float i = getElevation(v_texCoord + onePixel * vec2( 1.0,  1.0));

    float hillshade = mix(1., calcHillshade(a, b, c, d, e, f, g, h, i), u_hillshadeAmount);

    vec3 colourHillshade = applyTint(hillshade);

    float slope = calcSlope(a, b, c, d, e, f, g, h, i);

    vec4 gradientColor = calcGradientColour(u_useSlope > 0.5 ? slope : e);
    float contourAmount = gradientColor.a > CONTOUR_OPACITY_THRESHOLD ? u_contourAmount : 0.;

    float contour = contourAmount * calcContour(u_minorContour, u_majorContour, a, b, c, d, e, f, g, h, i);

    vec4 litColour = gradientColor * vec4(colourHillshade, 1.0) * u_gradientAmount;

    vec4 unmaskedColour = mix(litColour, u_contourColor, contour);
    vec4 clampedColour = clamp(unmaskedColour, vec4(0.0), vec4(unmaskedColour.a));

    gl_FragColor = mix(vec4(0.0, 0.0, 0.0, 0.0), clampedColour, maskValue);
}
