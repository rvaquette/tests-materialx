#version 300 es
#define MATERIALS_TEX_STRIDE 17
#define OPT_ENVMAP
#define OPT_RR
#define OPT_RR_DEPTH 2
#define OPT_OPENGL_NORMALMAP
#define OPT_BACKGROUND
#define OPT_MATERIALX

#ifdef GL_ES

#define samplerBuffer sampler2D
#define isamplerBuffer isampler2D
#define samplerArrayBuffer usampler2D 

precision highp float;
precision highp int;
precision highp isampler2D;
precision highp usampler2D;

vec4 texelFetch(samplerBuffer tex, int index) {
	int width = int( textureSize( tex, 0 ).x );
	ivec2 uv;
	uv.x = index % width;
	uv.y = index / width;
  	return texelFetch(tex, uv, 0);
}

ivec4 texelFetchI(isamplerBuffer tex, int index) {
	int width = int( textureSize( tex, 0 ).x );
	ivec2 uv;
	uv.x = index % width;
	uv.y = index / width;
  	return texelFetch(tex, uv, 0);
}

vec4 texelFetch1D(sampler2D tex, int index) {
	int width = int(textureSize(tex, 0).x);
	ivec2 uv;
	uv.x = index % width;
	uv.y = index / width;
	return texelFetch(tex, uv, 0);
}

ivec4 texelFetch1DI(isampler2D tex, int index) {
	int width = int(textureSize(tex, 0).x);
	ivec2 uv;
	uv.x = index % width;
	uv.y = index / width;
	return texelFetch(tex, uv, 0);
}

vec4 texture(samplerArrayBuffer tex, vec3 P) {
	int width = int( textureSize( tex, 0 ).x );
	int height = width;

	// Use the P coordinates to calculate the index in the texture array
	// P.z is the layer index, P.xy are the texture coordinates
	int texIndex = int(P.z);

	float u = P.x, v = P.y;
	if (v < 0.) v = 1. - fract(v); 
	else if (v > 1.) v = fract(v);

	int index = texIndex * width * height + int(floor(v * float(height))) * width + int(floor(u * float(width)));
	ivec2 uv;
	uv.x = index % width;
	uv.y = index / width;
  	return vec4(texelFetch(tex, uv, 0))/255.;
}

#endif

/*
 * MIT License
 *
 * Copyright(c) 2019 Asif Ali
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

out vec4 color;
in vec2 TexCoords;

uniform bool isCameraMoving;
uniform vec3 randomVector;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 invNumTiles;

uniform sampler2D accumTexture;
uniform samplerBuffer BVH;
uniform isamplerBuffer vertexIndicesTex;
uniform samplerBuffer verticesTex;
uniform samplerBuffer normalsTex;
uniform sampler2D materialsTex;
uniform sampler2D transformsTex;
uniform sampler2D lightsTex;
uniform samplerArrayBuffer textureMapsArrayTex;

uniform sampler2D envMapTex;
uniform sampler2D envMapCDFTex;

uniform vec2 envMapRes;
uniform float envMapTotalSum;
uniform float envMapIntensity;
uniform float envMapRot;
uniform vec3 uniformLightCol;
uniform int numOfLights;
uniform int maxDepth;
uniform int topBVHIndex;
uniform int frameNum;
uniform float roughnessMollificationAmt;

#define PI         3.14159265358979323
#define INV_PI     0.31830988618379067
#define TWO_PI     6.28318530717958648
#define INV_TWO_PI 0.15915494309189533
#define INV_4_PI   0.07957747154594766
#define EPS 0.0003
#define INF 1000000.0

#define QUAD_LIGHT 0
#define SPHERE_LIGHT 1
#define DISTANT_LIGHT 2

#define ALPHA_MODE_OPAQUE 0
#define ALPHA_MODE_BLEND 1
#define ALPHA_MODE_MASK 2

// MaterialX closure direction flags (mirror src/core/proceduralMaterial.ts).
#define CLOSURE_FLAG_REFLECT  1
#define CLOSURE_FLAG_TRANSMIT 2
#define CLOSURE_FLAG_EMISSIVE 4

// Material shading model discriminator (mirror src/core/material.ts MaterialType).
#define MATERIAL_TYPE_DISNEY    0
#define MATERIAL_TYPE_MATERIALX 1

// Number of vec4 in a material record's common block (shared by all types).
// The MaterialX per-material parameter payload (when present) follows this block.
#define MAT_COMMON_VEC4 8

// vec4 stride between consecutive materials in materialsTex. Injected per scene
// (= largest material record). Falls back to the common-block size when not set.
#ifndef MATERIALS_TEX_STRIDE
#define MATERIALS_TEX_STRIDE 8
#endif

#define MEDIUM_NONE 0
#define MEDIUM_ABSORB 1
#define MEDIUM_SCATTER 2
#define MEDIUM_EMISSIVE 3

struct Ray
{
    vec3 origin;
    vec3 direction;
};

struct Medium
{
    int type;
    float density;
    vec3 color;
    float anisotropy;
};

struct Material
{
    vec3 baseColor;
    float opacity;
    int alphaMode;
    float alphaCutoff;
    int materialType;
    vec3 emission;
    float anisotropic;
    float metallic;
    float roughness;
    float subsurface;
    float specularTint;
    float sheen;
    float sheenTint;
    float clearcoat;
    float clearcoatRoughness;
    float specTrans;
    float ior;
    float ax;
    float ay;
    Medium medium;
};

#ifndef OPT_SHADERTOY

struct Camera
{
    vec3 up;
    vec3 right;
    vec3 forward;
    vec3 position;
    float fov;
    float focalDist;
    float aperture;
};

uniform Camera camera;

#endif

struct Light
{
    vec3 position;
    vec3 emission;
    vec3 u;
    vec3 v;
    float radius;
    float area;
    float type;
};

struct State
{
    int depth;
    float eta;
    float hitDist;

    vec3 fhp;
    vec3 normal;
    vec3 ffnormal;
    vec3 tangent;
    vec3 bitangent;

    bool isEmitter;

    vec2 texCoord;
    int matID;
    Material mat;
    Medium medium;
};

struct ScatterSampleRec
{
    vec3 L;
    vec3 f;
    float pdf;
    int flags;
};

struct LightSampleRec
{
    vec3 normal;
    vec3 emission;
    vec3 direction;
    float dist;
    float pdf;
};

//RNG from code by Moroz Mykhailo (https://www.shadertoy.com/view/wltcRS)

//internal RNG state 
uvec4 seed;
ivec2 pixel;

void InitRNG(vec2 p, int frame)
{
    pixel = ivec2(p);
    seed = uvec4(p, uint(frame), uint(p.x) + uint(p.y));
}

void pcg4d(inout uvec4 v)
{
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
    v = v ^ (v >> 16u);
    v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
}

float rand()
{
    pcg4d(seed); return float(seed.x) / float(0xffffffffu);
}

vec3 FaceForward(vec3 a, vec3 b)
{
    return dot(a, b) < 0.0 ? -b : b;
}

float Luminance(vec3 c)
{
    return 0.212671 * c.x + 0.715160 * c.y + 0.072169 * c.z;
}

 
float SphereIntersect(float rad, vec3 pos, Ray r)
{
    vec3 op = pos - r.origin;
    float eps = 0.001;
    float b = dot(op, r.direction);
    float det = b * b - dot(op, op) + rad * rad;
    if (det < 0.0)
        return INF;

    det = sqrt(det);
    float t1 = b - det;
    if (t1 > eps)
        return t1;

    float t2 = b + det;
    if (t2 > eps)
        return t2;

    return INF;
}

float RectIntersect(in vec3 pos, in vec3 u, in vec3 v, in vec4 plane, in Ray r)
{
    vec3 n = vec3(plane);
    float dt = dot(r.direction, n);
    float t = (plane.w - dot(n, r.origin)) / dt;

    if (t > EPS)
    {
        vec3 p = r.origin + r.direction * t;
        vec3 vi = p - pos;
        float a1 = dot(u, vi);
        if (a1 >= 0.0 && a1 <= 1.0)
        {
            float a2 = dot(v, vi);
            if (a2 >= 0.0 && a2 <= 1.0)
                return t;
        }
    }

    return INF;
}

float AABBIntersect(vec3 minCorner, vec3 maxCorner, Ray r)
{
    vec3 invDir = 1.0 / r.direction;

    vec3 f = (maxCorner - r.origin) * invDir;
    vec3 n = (minCorner - r.origin) * invDir;

    vec3 tmax = max(f, n);
    vec3 tmin = min(f, n);

    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    float t0 = max(tmin.x, max(tmin.y, tmin.z));

    return (t1 >= t0) ? (t0 > 0.f ? t0 : t1) : -1.0;
}

float GTR1(float NDotH, float a)
{
    if (a >= 1.0)
        return INV_PI;
    float a2 = a * a;
    float t = 1.0 + (a2 - 1.0) * NDotH * NDotH;
    return (a2 - 1.0) / (PI * log(a2) * t);
}

vec3 SampleGTR1(float rgh, float r1, float r2)
{
    float a = max(0.001, rgh);
    float a2 = a * a;

    float phi = r1 * TWO_PI;

    float cosTheta = sqrt((1.0 - pow(a2, 1.0 - r2)) / (1.0 - a2));
    float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
    float sinPhi = sin(phi);
    float cosPhi = cos(phi);

    return vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
}

float GTR2(float NDotH, float a)
{
    float a2 = a * a;
    float t = 1.0 + (a2 - 1.0) * NDotH * NDotH;
    return a2 / (PI * t * t);
}

vec3 SampleGTR2(float rgh, float r1, float r2)
{
    float a = max(0.001, rgh);

    float phi = r1 * TWO_PI;

    float cosTheta = sqrt((1.0 - r2) / (1.0 + (a * a - 1.0) * r2));
    float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
    float sinPhi = sin(phi);
    float cosPhi = cos(phi);

    return vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
}

vec3 SampleGGXVNDF(vec3 V, float ax, float ay, float r1, float r2)
{
    vec3 Vh = normalize(vec3(ax * V.x, ay * V.y, V.z));

    float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
    vec3 T1 = lensq > 0. ? vec3(-Vh.y, Vh.x, 0) * inversesqrt(lensq) : vec3(1, 0, 0);
    vec3 T2 = cross(Vh, T1);

    float r = sqrt(r1);
    float phi = 2.0 * PI * r2;
    float t1 = r * cos(phi);
    float t2 = r * sin(phi);
    float s = 0.5 * (1.0 + Vh.z);
    t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

    vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;

    return normalize(vec3(ax * Nh.x, ay * Nh.y, max(0.0, Nh.z)));
}

float GTR2Aniso(float NDotH, float HDotX, float HDotY, float ax, float ay)
{
    float a = HDotX / ax;
    float b = HDotY / ay;
    float c = a * a + b * b + NDotH * NDotH;
    return 1.0 / (PI * ax * ay * c * c);
}

vec3 SampleGTR2Aniso(float ax, float ay, float r1, float r2)
{
    float phi = r1 * TWO_PI;

    float sinPhi = ay * sin(phi);
    float cosPhi = ax * cos(phi);
    float tanTheta = sqrt(r2 / (1. - r2));

    return vec3(tanTheta * cosPhi, tanTheta * sinPhi, 1.0);
}

float SmithG(float NDotV, float alphaG)
{
    float a = alphaG * alphaG;
    float b = NDotV * NDotV;
    return (2.0 * NDotV) / (NDotV + sqrt(a + b - a * b));
}

float SmithGAniso(float NDotV, float VDotX, float VDotY, float ax, float ay)
{
    float a = VDotX * ax;
    float b = VDotY * ay;
    float c = NDotV;
    return (2.0 * NDotV) / (NDotV + sqrt(a * a + b * b + c * c));
}

float SchlickWeight(float u)
{
    float m = clamp(1.0 - u, 0.0, 1.0);
    float m2 = m * m;
    return m2 * m2 * m;
}

float DielectricFresnel(float cosThetaI, float eta)
{
    float sinThetaTSq = eta * eta * (1.0f - cosThetaI * cosThetaI);

    // Total internal reflection
    if (sinThetaTSq > 1.0)
        return 1.0;

    float cosThetaT = sqrt(max(1.0 - sinThetaTSq, 0.0));

    float rs = (eta * cosThetaT - cosThetaI) / (eta * cosThetaT + cosThetaI);
    float rp = (eta * cosThetaI - cosThetaT) / (eta * cosThetaI + cosThetaT);

    return 0.5f * (rs * rs + rp * rp);
}

vec3 CosineSampleHemisphere(float r1, float r2)
{
    vec3 dir;
    float r = sqrt(r1);
    float phi = TWO_PI * r2;
    dir.x = r * cos(phi);
    dir.y = r * sin(phi);
    dir.z = sqrt(max(0.0, 1.0 - dir.x * dir.x - dir.y * dir.y));
    return dir;
}

vec3 UniformSampleHemisphere(float r1, float r2)
{
    float r = sqrt(max(0.0, 1.0 - r1 * r1));
    float phi = TWO_PI * r2;
    return vec3(r * cos(phi), r * sin(phi), r1);
}

vec3 UniformSampleSphere(float r1, float r2)
{
    float z = 1.0 - 2.0 * r1;
    float r = sqrt(max(0.0, 1.0 - z * z));
    float phi = TWO_PI * r2;
    return vec3(r * cos(phi), r * sin(phi), z);
}

float PowerHeuristic(float a, float b)
{
    float t = a * a;
    return t / (b * b + t);
}

void Onb(in vec3 N, inout vec3 T, inout vec3 B)
{
    vec3 up = abs(N.z) < 0.9999999 ? vec3(0, 0, 1) : vec3(1, 0, 0);
    T = normalize(cross(up, N));
    B = cross(N, T);
}

void SampleSphereLight(in Light light, in vec3 scatterPos, inout LightSampleRec lightSample)
{
    float r1 = rand();
    float r2 = rand();

    vec3 sphereCentertoSurface = scatterPos - light.position;
    float distToSphereCenter = length(sphereCentertoSurface);
    vec3 sampledDir;

    // TODO: Fix this. Currently assumes the light will be hit only from the outside
    sphereCentertoSurface /= distToSphereCenter;
    sampledDir = UniformSampleHemisphere(r1, r2);
    vec3 T, B;
    Onb(sphereCentertoSurface, T, B);
    sampledDir = T * sampledDir.x + B * sampledDir.y + sphereCentertoSurface * sampledDir.z;

    vec3 lightSurfacePos = light.position + sampledDir * light.radius;

    lightSample.direction = lightSurfacePos - scatterPos;
    lightSample.dist = length(lightSample.direction);
    float distSq = lightSample.dist * lightSample.dist;

    lightSample.direction /= lightSample.dist;
    lightSample.normal = normalize(lightSurfacePos - light.position);
    lightSample.emission = light.emission * float(numOfLights);
    lightSample.pdf = distSq / (light.area * 0.5 * abs(dot(lightSample.normal, lightSample.direction)));
}

void SampleRectLight(in Light light, in vec3 scatterPos, inout LightSampleRec lightSample)
{
    float r1 = rand();
    float r2 = rand();

    vec3 lightSurfacePos = light.position + light.u * r1 + light.v * r2;
    lightSample.direction = lightSurfacePos - scatterPos;
    lightSample.dist = length(lightSample.direction);
    float distSq = lightSample.dist * lightSample.dist;
    lightSample.direction /= lightSample.dist;
    lightSample.normal = normalize(cross(light.u, light.v));
    lightSample.emission = light.emission * float(numOfLights);
    lightSample.pdf = distSq / (light.area * abs(dot(lightSample.normal, lightSample.direction)));
}

void SampleDistantLight(in Light light, in vec3 scatterPos, inout LightSampleRec lightSample)
{
    lightSample.direction = normalize(light.position - vec3(0.0));
    lightSample.normal = normalize(scatterPos - light.position);
    lightSample.emission = light.emission * float(numOfLights);
    lightSample.dist = INF;
    lightSample.pdf = 1.0;
}

void SampleOneLight(in Light light, in vec3 scatterPos, inout LightSampleRec lightSample)
{
    int type = int(light.type);

    if (type == QUAD_LIGHT)
        SampleRectLight(light, scatterPos, lightSample);
    else if (type == SPHERE_LIGHT)
        SampleSphereLight(light, scatterPos, lightSample);
    else
        SampleDistantLight(light, scatterPos, lightSample);
}

vec3 SampleHG(vec3 V, float g, float r1, float r2)
{
    float cosTheta;

    if (abs(g) < 0.001)
        cosTheta = 1. - 2. * r2;
    else 
    {
        float sqrTerm = (1. - g * g) / (1. + g - 2. * g * r2);
        cosTheta = -(1. + g * g - sqrTerm * sqrTerm) / (2. * g);
    }

    float phi = r1 * TWO_PI;
    float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
    float sinPhi = sin(phi);
    float cosPhi = cos(phi);

    vec3 v1, v2;
    Onb(V, v1, v2);

    return sinTheta * cosPhi * v1 + sinTheta * sinPhi * v2 + cosTheta * V;
}

float PhaseHG(float cosTheta, float g)
{
    float denom = 1. + g * g + 2. * g * cosTheta;
    return INV_4_PI * (1. - g * g) / (denom * sqrt(denom));
}

#ifdef OPT_ENVMAP
#ifndef OPT_UNIFORM_LIGHT

vec2 BinarySearch(float value)
{
    ivec2 envMapResInt = ivec2(envMapRes);
    int lower = 0;
    int upper = envMapResInt.y - 1;
    while (lower < upper)
    {
        int mid = (lower + upper) >> 1;
        if (value < texelFetch(envMapCDFTex, ivec2(envMapResInt.x - 1, mid), 0).r)
            upper = mid;
        else
            lower = mid + 1;
    }
    int y = clamp(lower, 0, envMapResInt.y - 1);

    lower = 0;
    upper = envMapResInt.x - 1;
    while (lower < upper)
    {
        int mid = (lower + upper) >> 1;
        if (value < texelFetch(envMapCDFTex, ivec2(mid, y), 0).r)
            upper = mid;
        else
            lower = mid + 1;
    }
    int x = clamp(lower, 0, envMapResInt.x - 1);
    return vec2(x, y) / envMapRes;
}

vec4 EvalEnvMap(Ray r)
{
    float theta = acos(clamp(r.direction.y, -1.0, 1.0));
    vec2 uv = vec2((PI + atan(r.direction.z, r.direction.x)) * INV_TWO_PI, theta * INV_PI) + vec2(envMapRot, 0.0);
    
    vec3 color = texture(envMapTex, uv).rgb;
    float pdf = Luminance(color) / envMapTotalSum;
                
    return vec4(color, (pdf * envMapRes.x * envMapRes.y) / (TWO_PI * PI * sin(theta)));
}

vec4 SampleEnvMap(inout vec3 color)
{
    vec2 uv = BinarySearch(rand() * envMapTotalSum);

    color = texture(envMapTex, uv).rgb;
    float pdf = Luminance(color) / envMapTotalSum;

    uv.x -= envMapRot;
    float phi = uv.x * TWO_PI;
    float theta = uv.y * PI;

    if (sin(theta) == 0.0)
        pdf = 0.0;

    return vec4(-sin(theta) * cos(phi), cos(theta), -sin(theta) * sin(phi), (pdf * envMapRes.x * envMapRes.y) / (TWO_PI * PI * sin(theta)));
}

#endif
#endif

bool AnyHit(Ray r, float maxDist)
{

#ifdef OPT_LIGHTS
    // Intersect Emitters
    for (int i = 0; i < numOfLights; i++)
    {
        // Fetch light Data
        vec3 position = texelFetch1D(lightsTex, i * 5 + 0).xyz;
        vec3 emission = texelFetch1D(lightsTex, i * 5 + 1).xyz;
        vec3 u        = texelFetch1D(lightsTex, i * 5 + 2).xyz;
        vec3 v        = texelFetch1D(lightsTex, i * 5 + 3).xyz;
        vec3 params   = texelFetch1D(lightsTex, i * 5 + 4).xyz;

        float radius  = params.x;
        float area    = params.y;
        int type      = int(params.z);

        // Intersect rectangular area light
        if (type == QUAD_LIGHT)
        {
            vec3 normal = normalize(cross(u, v));
            vec4 plane = vec4(normal, dot(normal, position));
            u *= 1.0f / dot(u, u);
            v *= 1.0f / dot(v, v);

            float d = RectIntersect(position, u, v, plane, r);
            if (d > 0.0 && d < maxDist)
                return true;
        }

        // Intersect spherical area light
        if (type == SPHERE_LIGHT)
        {
            float d = SphereIntersect(radius, position, r);
            if (d > 0.0 && d < maxDist)
                return true;
        }
    }
#endif

#if defined(OPT_RAYMARCHING)
	
    State state;
	bool hit = getSceneHit(r, state);
    return hit;

#else

    // Intersect BVH and tris
    int stack[64];
    int ptr = 0;
    stack[ptr++] = -1;

    int index = topBVHIndex;
    float leftHit = 0.0;
    float rightHit = 0.0;

#if defined(OPT_ALPHA_TEST) && !defined(OPT_MEDIUM)
    int currMatID = 0;
#endif
    bool BLAS = false;

    Ray rTrans;
    rTrans.origin = r.origin;
    rTrans.direction = r.direction;

    while (index != -1)
    {
        bool continue_ = false;

        ivec3 LRLeaf = ivec3(texelFetch(BVH, index * 3 + 2).xyz);

        int leftIndex  = int(LRLeaf.x);
        int rightIndex = int(LRLeaf.y);
        int leaf       = int(LRLeaf.z);

        if (leaf > 0) // Leaf node of BLAS
        {
            for (int i = 0; i < rightIndex; i++) // Loop through tris
            {
                ivec3 vertIndices = ivec3(texelFetchI(vertexIndicesTex, leftIndex + i).xyz);

                vec4 v0 = texelFetch(verticesTex, vertIndices.x);
                vec4 v1 = texelFetch(verticesTex, vertIndices.y);
                vec4 v2 = texelFetch(verticesTex, vertIndices.z);

                vec3 e0 = v1.xyz - v0.xyz;
                vec3 e1 = v2.xyz - v0.xyz;
                vec3 pv = cross(rTrans.direction, e1);
                float det = dot(e0, pv);

                vec3 tv = rTrans.origin - v0.xyz;
                vec3 qv = cross(tv, e0);

                vec4 uvt;
                uvt.x = dot(tv, pv);
                uvt.y = dot(rTrans.direction, qv);
                uvt.z = dot(e1, qv);
                uvt.xyz = uvt.xyz / det;
                uvt.w = 1.0 - uvt.x - uvt.y;

                if (all(greaterThanEqual(uvt, vec4(0.0))) && uvt.z < maxDist)
                {
#if defined(OPT_ALPHA_TEST) && !defined(OPT_MEDIUM)
                    vec2 t0 = vec2(v0.w, texelFetch(normalsTex, vertIndices.x).w);
                    vec2 t1 = vec2(v1.w, texelFetch(normalsTex, vertIndices.y).w);
                    vec2 t2 = vec2(v2.w, texelFetch(normalsTex, vertIndices.z).w);

                    vec2 texCoord = t0 * uvt.w + t1 * uvt.x + t2 * uvt.y;
 
                    vec4 texIDs      = texelFetch1D(materialsTex, currMatID * MATERIALS_TEX_STRIDE + 6);
                    vec4 alphaParams = texelFetch1D(materialsTex, currMatID * MATERIALS_TEX_STRIDE + 7);

                    float alpha = texture(textureMapsArrayTex, vec3(texCoord, texIDs.x)).a;
                    float opacity = alphaParams.x;
                    int alphaMode = int(alphaParams.y);
                    float alphaCutoff = alphaParams.z;

                    opacity *= alpha;

                    // Ignore intersection and continue ray based on alpha test
                    if (!((alphaMode == ALPHA_MODE_MASK && opacity < alphaCutoff) || 
                          (alphaMode == ALPHA_MODE_BLEND && rand() > opacity)))
                        return true;
#else
                    return true;
#endif
                }
                    
            }
        }
        else if (leaf < 0) // Leaf node of TLAS
        {
            vec4 r1 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 0).xyzw;
            vec4 r2 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 1).xyzw;
            vec4 r3 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 2).xyzw;
            vec4 r4 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 3).xyzw;

            mat4 transform = mat4(r1, r2, r3, r4);
            
            rTrans.origin    = vec3(inverse(transform) * vec4(r.origin, 1.0));
            rTrans.direction = vec3(inverse(transform) * vec4(r.direction, 0.0));

            // Add a marker. We'll return to this spot after we've traversed the entire BLAS
            stack[ptr++] = -1;

            index = leftIndex;
            BLAS = true;
#if defined(OPT_ALPHA_TEST) && !defined(OPT_MEDIUM)
            currMatID = rightIndex;
#endif
            continue_ = true;
        }
        else
        {
            leftHit  = AABBIntersect(texelFetch(BVH, leftIndex  * 3 + 0).xyz, texelFetch(BVH, leftIndex  * 3 + 1).xyz, rTrans);
            rightHit = AABBIntersect(texelFetch(BVH, rightIndex * 3 + 0).xyz, texelFetch(BVH, rightIndex * 3 + 1).xyz, rTrans);

            if (leftHit > 0.0 && rightHit > 0.0)
            {
                int deferred = -1;
                if (leftHit > rightHit)
                {
                    index = rightIndex;
                    deferred = leftIndex;
                }
                else
                {
                    index = leftIndex;
                    deferred = rightIndex;
                }

                stack[ptr++] = deferred;
                continue_ = true;
            }
            else if (leftHit > 0.)
            {
                index = leftIndex;
                continue_ = true;
            }
            else if (rightHit > 0.)
            {
                index = rightIndex;
                continue_ = true;
            }
        }
        if (!continue_) {
        index = stack[--ptr];

        // If we've traversed the entire BLAS then switch to back to TLAS and resume where we left off
        if (BLAS && index == -1)
        {
            BLAS = false;

            index = stack[--ptr];

            rTrans.origin = r.origin;
            rTrans.direction = r.direction;
        }
        }
    }

    return false;

#endif
}

bool ClosestHit(Ray r, inout State state, inout LightSampleRec lightSample)
{
    float t = INF;
    float d;

#ifdef OPT_LIGHTS
    // Intersect Emitters
#ifdef OPT_HIDE_EMITTERS
if(state.depth > 0)
#endif
    for (int i = 0; i < numOfLights; i++)
    {
        // Fetch light Data
        vec3 position = texelFetch1D(lightsTex, i * 5 + 0).xyz;
        vec3 emission = texelFetch1D(lightsTex, i * 5 + 1).xyz;
        vec3 u        = texelFetch1D(lightsTex, i * 5 + 2).xyz;
        vec3 v        = texelFetch1D(lightsTex, i * 5 + 3).xyz;
        vec3 params   = texelFetch1D(lightsTex, i * 5 + 4).xyz;
        float radius  = params.x;
        float area    = params.y;
        int type      = int(params.z);

        if (type == QUAD_LIGHT)
        {
            vec3 normal = normalize(cross(u, v));
            if (dot(normal, r.direction) > 0.) // Hide backfacing quad light
                continue;
            vec4 plane = vec4(normal, dot(normal, position));
            u *= 1.0f / dot(u, u);
            v *= 1.0f / dot(v, v);

            d = RectIntersect(position, u, v, plane, r);
            if (d < 0.)
                d = INF;
            if (d < t)
            {
                t = d;
                float cosTheta = dot(-r.direction, normal);
                lightSample.pdf = (t * t) / (area * cosTheta);
                lightSample.emission = emission;
                state.isEmitter = true;
            }
        }

        if (type == SPHERE_LIGHT)
        {
            d = SphereIntersect(radius, position, r);
            if (d < 0.)
                d = INF;
            if (d < t)
            {
                t = d;
                vec3 hitPt = r.origin + t * r.direction;
                float cosTheta = dot(-r.direction, normalize(hitPt - position));
                // TODO: Fix this. Currently assumes the light will be hit only from the outside
                lightSample.pdf = (t * t) / (area * cosTheta * 0.5);
                lightSample.emission = emission;
                state.isEmitter = true;
            }
        }
    }
#endif

#if defined(OPT_RAYMARCHING)
	
	bool hit = getSceneHit(r, state);
	
    if (state.isEmitter && (!hit || state.hitDist > t))
        return true;

    // No intersections
    if (!hit)
        return false;

    // Ray hit a triangle and not a light source
    state.isEmitter = false;

    state.ffnormal = dot(state.normal, r.direction) <= 0.0 ? state.normal : -state.normal;

    return true;
    
#else

    // Intersect BVH and tris
    int stack[64];
    int ptr = 0;
    stack[ptr++] = -1;

    int index = topBVHIndex;
    float leftHit = 0.0;
    float rightHit = 0.0;

    int currMatID = 0;
    bool BLAS = false;

    ivec3 triID = ivec3(-1);
    mat4 transMat;
    mat4 transform;
    vec3 bary;
    vec4 vert0, vert1, vert2;

    Ray rTrans;
    rTrans.origin = r.origin;
    rTrans.direction = r.direction;

    while (index != -1)
    {
        bool continue_ = false;

        ivec3 LRLeaf = ivec3(texelFetch(BVH, index * 3 + 2).xyz);

        int leftIndex  = int(LRLeaf.x);
        int rightIndex = int(LRLeaf.y);
        int leaf       = int(LRLeaf.z);

        if (leaf > 0) // Leaf node of BLAS
        {
            for (int i = 0; i < rightIndex; i++) // Loop through tris
            {
                ivec3 vertIndices = ivec3(texelFetchI(vertexIndicesTex, leftIndex + i).xyz);

                vec4 v0 = texelFetch(verticesTex, vertIndices.x);
                vec4 v1 = texelFetch(verticesTex, vertIndices.y);
                vec4 v2 = texelFetch(verticesTex, vertIndices.z);

                vec3 e0 = v1.xyz - v0.xyz;
                vec3 e1 = v2.xyz - v0.xyz;
                vec3 pv = cross(rTrans.direction, e1);
                float det = dot(e0, pv);

                vec3 tv = rTrans.origin - v0.xyz;
                vec3 qv = cross(tv, e0);

                vec4 uvt;
                uvt.x = dot(tv, pv);
                uvt.y = dot(rTrans.direction, qv);
                uvt.z = dot(e1, qv);
                uvt.xyz = uvt.xyz / det;
                uvt.w = 1.0 - uvt.x - uvt.y;

                if (all(greaterThanEqual(uvt, vec4(0.0))) && uvt.z < t)
                {
                    t = uvt.z;
                    triID = vertIndices;
                    state.matID = currMatID;
                    bary = uvt.wxy;
                    vert0 = v0, vert1 = v1, vert2 = v2;
                    transform = transMat;
                }
            }
        }
        else if (leaf < 0) // Leaf node of TLAS
        {
            vec4 r1 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 0).xyzw;
            vec4 r2 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 1).xyzw;
            vec4 r3 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 2).xyzw;
            vec4 r4 = texelFetch1D(transformsTex, (-leaf - 1) * 4 + 3).xyzw;

            transMat = mat4(r1, r2, r3, r4);

            rTrans.origin    = vec3(inverse(transMat) * vec4(r.origin, 1.0));
            rTrans.direction = vec3(inverse(transMat) * vec4(r.direction, 0.0));

            // Add a marker. We'll return to this spot after we've traversed the entire BLAS
            stack[ptr++] = -1;
            index = leftIndex;
            BLAS = true;
            currMatID = rightIndex;
            continue_ = true;
        }
        else
        {
            leftHit  = AABBIntersect(texelFetch(BVH, leftIndex  * 3 + 0).xyz, texelFetch(BVH, leftIndex  * 3 + 1).xyz, rTrans);
            rightHit = AABBIntersect(texelFetch(BVH, rightIndex * 3 + 0).xyz, texelFetch(BVH, rightIndex * 3 + 1).xyz, rTrans);

            if (leftHit > 0.0 && rightHit > 0.0)
            {
                int deferred = -1;
                if (leftHit > rightHit)
                {
                    index = rightIndex;
                    deferred = leftIndex;
                }
                else
                {
                    index = leftIndex;
                    deferred = rightIndex;
                }

                stack[ptr++] = deferred;
                continue_ = true;
            }
            else if (leftHit > 0.)
            {
                index = leftIndex;
                continue_ = true;
            }
            else if (rightHit > 0.)
            {
                index = rightIndex;
                continue_ = true;
            }
        }
        if (!continue_) {
        index = stack[--ptr];

        // If we've traversed the entire BLAS then switch to back to TLAS and resume where we left off
        if (BLAS && index == -1)
        {
            BLAS = false;

            index = stack[--ptr];

            rTrans.origin = r.origin;
            rTrans.direction = r.direction;
        }
        }
    }

    // No intersections
    if (t == INF)
        return false;

    state.hitDist = t;
    state.fhp = r.origin + r.direction * t;

    // Ray hit a triangle and not a light source
    if (triID.x != -1)
    {
        state.isEmitter = false;

        // Normals
        vec4 n0 = texelFetch(normalsTex, triID.x);
        vec4 n1 = texelFetch(normalsTex, triID.y);
        vec4 n2 = texelFetch(normalsTex, triID.z);

        // Get texcoords from w coord of vertices and normals
        vec2 t0 = vec2(vert0.w, n0.w);
        vec2 t1 = vec2(vert1.w, n1.w);
        vec2 t2 = vec2(vert2.w, n2.w);

        // Interpolate texture coords and normals using barycentric coords
        state.texCoord = t0 * bary.x + t1 * bary.y + t2 * bary.z;
        vec3 normal = normalize(n0.xyz * bary.x + n1.xyz * bary.y + n2.xyz * bary.z);

        state.normal = normalize(transpose(inverse(mat3(transform))) * normal);
        state.ffnormal = dot(state.normal, r.direction) <= 0.0 ? state.normal : -state.normal;

        // Calculate tangent and bitangent
        vec3 deltaPos1 = vert1.xyz - vert0.xyz;
        vec3 deltaPos2 = vert2.xyz - vert0.xyz;

        vec2 deltaUV1 = t1 - t0;
        vec2 deltaUV2 = t2 - t0;

        float invdet = 1.0f / (deltaUV1.x * deltaUV2.y - deltaUV1.y * deltaUV2.x);

        state.tangent = (deltaPos1 * deltaUV2.y - deltaPos2 * deltaUV1.y) * invdet;
        state.bitangent = (deltaPos2 * deltaUV1.x - deltaPos1 * deltaUV2.x) * invdet;

        state.tangent = normalize(mat3(transform) * state.tangent);
        state.bitangent = normalize(mat3(transform) * state.bitangent);
    }

    return true;

#endif
}
// NOTE: The built-in Disney model must remain available even under OPT_MATERIALX
// so that a mixed scene can shade Disney-typed materials at runtime. The guard
// below uses a sentinel macro that is never defined (was: #ifndef OPT_MATERIALX).
#ifndef OPT_DISABLE_BUILTIN_BSDF

 /* References:
 * [1] [Physically Based Shading at Disney] https://media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf
 * [2] [Extending the Disney BRDF to a BSDF with Integrated Subsurface Scattering] https://blog.selfshadow.com/publications/s2015-shading-course/burley/s2015_pbs_disney_bsdf_notes.pdf
 * [3] [The Disney BRDF Explorer] https://github.com/wdas/brdf/blob/main/src/brdfs/disney.brdf
 * [4] [Miles Macklin's implementation] https://github.com/mmacklin/tinsel/blob/master/src/disney.h
 * [5] [Simon Kallweit's project report] http://simon-kallweit.me/rendercompo2015/report/
 * [6] [Microfacet Models for Refraction through Rough Surfaces] https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
 * [7] [Sampling the GGX Distribution of Visible Normals] https://jcgt.org/published/0007/04/01/paper.pdf
 * [8] [Pixar's Foundation for Materials] https://graphics.pixar.com/library/PxrMaterialsCourse2017/paper.pdf
 * [9] [Mitsuba 3] https://github.com/mitsuba-renderer/mitsuba3
 */

vec3 DisneyEval(State state, vec3 V, vec3 N, vec3 L, out float pdf);

vec3 ToWorld(vec3 X, vec3 Y, vec3 Z, vec3 V)
{
    return V.x * X + V.y * Y + V.z * Z;
}

vec3 ToLocal(vec3 X, vec3 Y, vec3 Z, vec3 V)
{
    return vec3(dot(V, X), dot(V, Y), dot(V, Z));
}

void TintColors(Material mat, float eta, out float F0, out vec3 Csheen, out vec3 Cspec0)
{
    float lum = Luminance(mat.baseColor);
    vec3 ctint = lum > 0.0 ? mat.baseColor / lum : vec3(1.0);

    F0 = (1.0 - eta) / (1.0 + eta);
    F0 *= F0;
    
    Cspec0 = F0 * mix(vec3(1.0), ctint, mat.specularTint);
    Csheen = mix(vec3(1.0), ctint, mat.sheenTint);
}

vec3 EvalDisneyDiffuse(Material mat, vec3 Csheen, vec3 V, vec3 L, vec3 H, out float pdf)
{
    pdf = 0.0;
    if (L.z <= 0.0)
        return vec3(0.0);

    float LDotH = dot(L, H);

    float Rr = 2.0 * mat.roughness * LDotH * LDotH;

    // Diffuse
    float FL = SchlickWeight(L.z);
    float FV = SchlickWeight(V.z);
    float Fretro = Rr * (FL + FV + FL * FV * (Rr - 1.0));
    float Fd = (1.0 - 0.5 * FL) * (1.0 - 0.5 * FV);

    // Fake subsurface
    float Fss90 = 0.5 * Rr;
    float Fss = mix(1.0, Fss90, FL) * mix(1.0, Fss90, FV);
    float ss = 1.25 * (Fss * (1.0 / (L.z + V.z) - 0.5) + 0.5);

    // Sheen
    float FH = SchlickWeight(LDotH);
    vec3 Fsheen = FH * mat.sheen * Csheen;

    pdf = L.z * INV_PI;
    return INV_PI * mat.baseColor * mix(Fd + Fretro, ss, mat.subsurface) + Fsheen;
}

vec3 EvalMicrofacetReflection(Material mat, vec3 V, vec3 L, vec3 H, vec3 F, out float pdf)
{
    pdf = 0.0;
    if (L.z <= 0.0)
        return vec3(0.0);

    float D = GTR2Aniso(H.z, H.x, H.y, mat.ax, mat.ay);
    float G1 = SmithGAniso(abs(V.z), V.x, V.y, mat.ax, mat.ay);
    float G2 = G1 * SmithGAniso(abs(L.z), L.x, L.y, mat.ax, mat.ay);

    pdf = G1 * D / (4.0 * V.z);
    return F * D * G2 / (4.0 * L.z * V.z);
}

vec3 EvalMicrofacetRefraction(Material mat, float eta, vec3 V, vec3 L, vec3 H, vec3 F, out float pdf)
{
    pdf = 0.0;
    if (L.z >= 0.0)
        return vec3(0.0);

    float LDotH = dot(L, H);
    float VDotH = dot(V, H);

    float D = GTR2Aniso(H.z, H.x, H.y, mat.ax, mat.ay);
    float G1 = SmithGAniso(abs(V.z), V.x, V.y, mat.ax, mat.ay);
    float G2 = G1 * SmithGAniso(abs(L.z), L.x, L.y, mat.ax, mat.ay);
    float denom = LDotH + VDotH * eta;
    denom *= denom;
    float eta2 = eta * eta;
    float jacobian = abs(LDotH) / denom;

    pdf = G1 * max(0.0, VDotH) * D * jacobian / V.z;
    return pow(mat.baseColor, vec3(0.5)) * (1.0 - F) * D * G2 * abs(VDotH) * jacobian * eta2 / abs(L.z * V.z);
}

vec3 EvalClearcoat(Material mat, vec3 V, vec3 L, vec3 H, out float pdf)
{
    pdf = 0.0;
    if (L.z <= 0.0)
        return vec3(0.0);

    float VDotH = dot(V, H);

    float F = mix(0.04, 1.0, SchlickWeight(VDotH));
    float D = GTR1(H.z, mat.clearcoatRoughness);
    float G = SmithG(L.z, 0.25) * SmithG(V.z, 0.25);
    float jacobian = 1.0 / (4.0 * VDotH);

    pdf = D * H.z * jacobian;
    return vec3(F) * D * G;
}

vec3 DisneySample(State state, vec3 V, vec3 N, out vec3 L, out float pdf)
{
    pdf = 0.0;

    float r1 = rand();
    float r2 = rand();

    // TODO: Tangent and bitangent should be calculated from mesh (provided, the mesh has proper uvs)
    vec3 T, B;
    Onb(N, T, B);

    // Transform to shading space to simplify operations (NDotL = L.z; NDotV = V.z; NDotH = H.z)
    V = ToLocal(T, B, N, V);

    // Tint colors
    vec3 Csheen, Cspec0;
    float F0;
    TintColors(state.mat, state.eta, F0, Csheen, Cspec0);

    // Model weights
    float dielectricWt = (1.0 - state.mat.metallic) * (1.0 - state.mat.specTrans);
    float metalWt = state.mat.metallic;
    float glassWt = (1.0 - state.mat.metallic) * state.mat.specTrans;

    // Lobe probabilities
    float schlickWt = SchlickWeight(V.z);

    float diffPr = dielectricWt * Luminance(state.mat.baseColor);
    float dielectricPr = dielectricWt * Luminance(mix(Cspec0, vec3(1.0), schlickWt));
    float metalPr = metalWt * Luminance(mix(state.mat.baseColor, vec3(1.0), schlickWt));
    float glassPr = glassWt;
    float clearCtPr = 0.25 * state.mat.clearcoat;

    // Normalize probabilities
    float invTotalWt = 1.0 / (diffPr + dielectricPr + metalPr + glassPr + clearCtPr);
    diffPr *= invTotalWt;
    dielectricPr *= invTotalWt;
    metalPr *= invTotalWt;
    glassPr *= invTotalWt;
    clearCtPr *= invTotalWt;

    // CDF of the sampling probabilities
    float cdf[5];
    cdf[0] = diffPr;
    cdf[1] = cdf[0] + dielectricPr;
    cdf[2] = cdf[1] + metalPr;
    cdf[3] = cdf[2] + glassPr;
    cdf[4] = cdf[3] + clearCtPr;

    // Sample a lobe based on its importance
    float r3 = rand();

    if (r3 < cdf[0]) // Diffuse
    {
        L = CosineSampleHemisphere(r1, r2);
    }
    else if (r3 < cdf[2]) // Dielectric + Metallic reflection
    {
        vec3 H = SampleGGXVNDF(V, state.mat.ax, state.mat.ay, r1, r2);

        if (H.z < 0.0)
            H = -H;

        L = normalize(reflect(-V, H));
    }
    else if (r3 < cdf[3]) // Glass
    {
        vec3 H = SampleGGXVNDF(V, state.mat.ax, state.mat.ay, r1, r2);
        float F = DielectricFresnel(abs(dot(V, H)), state.eta);

        if (H.z < 0.0)
            H = -H;

        // Rescale random number for reuse
        r3 = (r3 - cdf[2]) / (cdf[3] - cdf[2]);

        // Reflection
        if (r3 < F)
        {
            L = normalize(reflect(-V, H));
        }
        else // Transmission
        {
            L = normalize(refract(-V, H, state.eta));
        }
    }
    else // Clearcoat
    {
        vec3 H = SampleGTR1(state.mat.clearcoatRoughness, r1, r2);

        if (H.z < 0.0)
            H = -H;

        L = normalize(reflect(-V, H));
    }

    L = ToWorld(T, B, N, L);
    V = ToWorld(T, B, N, V);

    return DisneyEval(state, V, N, L, pdf);
}

vec3 DisneyEval(State state, vec3 V, vec3 N, vec3 L, out float pdf)
{
    pdf = 0.0;
    vec3 f = vec3(0.0);

    // TODO: Tangent and bitangent should be calculated from mesh (provided, the mesh has proper uvs)
    vec3 T, B;
    Onb(N, T, B);

    // Transform to shading space to simplify operations (NDotL = L.z; NDotV = V.z; NDotH = H.z)
    V = ToLocal(T, B, N, V);
    L = ToLocal(T, B, N, L);

    vec3 H;
    if (L.z > 0.0)
        H = normalize(L + V);
    else
        H = normalize(L + V * state.eta);

    if (H.z < 0.0)
        H = -H;

    // Tint colors
    vec3 Csheen, Cspec0;
    float F0;
    TintColors(state.mat, state.eta, F0, Csheen, Cspec0);

    // Model weights
    float dielectricWt = (1.0 - state.mat.metallic) * (1.0 - state.mat.specTrans);
    float metalWt = state.mat.metallic;
    float glassWt = (1.0 - state.mat.metallic) * state.mat.specTrans;

    // Lobe probabilities
    float schlickWt = SchlickWeight(V.z);

    float diffPr = dielectricWt * Luminance(state.mat.baseColor);
    float dielectricPr = dielectricWt * Luminance(mix(Cspec0, vec3(1.0), schlickWt));
    float metalPr = metalWt * Luminance(mix(state.mat.baseColor, vec3(1.0), schlickWt));
    float glassPr = glassWt;
    float clearCtPr = 0.25 * state.mat.clearcoat;

    // Normalize probabilities
    float invTotalWt = 1.0 / (diffPr + dielectricPr + metalPr + glassPr + clearCtPr);
    diffPr *= invTotalWt;
    dielectricPr *= invTotalWt;
    metalPr *= invTotalWt;
    glassPr *= invTotalWt;
    clearCtPr *= invTotalWt;

    bool reflect = L.z * V.z > 0.;

    float tmpPdf = 0.0;
    float VDotH = abs(dot(V, H));

    // Diffuse
    if (diffPr > 0.0 && reflect)
    {
        f += EvalDisneyDiffuse(state.mat, Csheen, V, L, H, tmpPdf) * dielectricWt;
        pdf += tmpPdf * diffPr;
    }

    // Dielectric Reflection
    if (dielectricPr > 0.0 && reflect)
    {
        // Normalize for interpolating based on Cspec0
        float F = (DielectricFresnel(VDotH, 1.0 / state.mat.ior) - F0) / (1.0 - F0);

        f += EvalMicrofacetReflection(state.mat, V, L, H, mix(Cspec0, vec3(1.0), F), tmpPdf) * dielectricWt;
        pdf += tmpPdf * dielectricPr;
    }

    // Metallic Reflection
    if (metalPr > 0.0 && reflect)
    {
        // Tinted to base color
        vec3 F = mix(state.mat.baseColor, vec3(1.0), SchlickWeight(VDotH));

        f += EvalMicrofacetReflection(state.mat, V, L, H, F, tmpPdf) * metalWt;
        pdf += tmpPdf * metalPr;
    }

    // Glass/Specular BSDF
    if (glassPr > 0.0)
    {
        // Dielectric fresnel (achromatic)
        float F = DielectricFresnel(VDotH, state.eta);

        if (reflect)
        {
            f += EvalMicrofacetReflection(state.mat, V, L, H, vec3(F), tmpPdf) * glassWt;
            pdf += tmpPdf * glassPr * F;
        }
        else
        {
            f += EvalMicrofacetRefraction(state.mat, state.eta, V, L, H, vec3(F), tmpPdf) * glassWt;
            pdf += tmpPdf * glassPr * (1.0 - F);
        }
    }

    // Clearcoat
    if (clearCtPr > 0.0 && reflect)
    {
        f += EvalClearcoat(state.mat, V, L, H, tmpPdf) * 0.25 * state.mat.clearcoat;
        pdf += tmpPdf * clearCtPr;
    }

    return f * abs(L.z);
}

#endif
#ifdef OPT_MATERIALX

// Generated by validate-mtlx and injected in pathtrace.glsl.
vec3 EvalMtlxClosure(int matID, State state, vec3 V, vec3 N, vec3 L, out float pdf, out int flags);
vec3 SampleMtlxClosure(int matID, State state, vec3 V, vec3 N, out vec3 L, out float pdf, out int flags);

int ClosureFlagsFromDirection(vec3 V, vec3 L)
{
    return (dot(V, L) >= 0.0) ? CLOSURE_FLAG_REFLECT : CLOSURE_FLAG_TRANSMIT;
}

#endif

bool ClosureSupportsDirection(int flags, vec3 V, vec3 L)
{
#ifdef OPT_MATERIALX
    int requested = ClosureFlagsFromDirection(V, L);
    return (flags & requested) != 0;
#else
    return true;
#endif
}

vec3 EvalClosureBridge(State state, vec3 V, vec3 N, vec3 L, out float pdf, out int flags)
{
#if defined(OPT_MATERIALX) && !defined(OPT_PREVIEW)
    // Per-material runtime dispatch: MaterialX materials use the generated
    // closure; every other type (Disney, or an unknown/unsupported type) falls
    // back to the built-in Disney model (deterministic fallback, FR-010).
    // In preview mode (OPT_PREVIEW) the heavy MaterialX closure is skipped and
    // all materials are shaded with the cheap built-in Disney model for speed.
    if (state.mat.materialType == MATERIAL_TYPE_MATERIALX)
        return EvalMtlxClosure(state.matID, state, V, N, L, pdf, flags);
    flags = 0;
    return DisneyEval(state, V, N, L, pdf);
#else
    flags = 0;
    return DisneyEval(state, V, N, L, pdf);
#endif
}

vec3 SampleClosureBridge(State state, vec3 V, vec3 N, out vec3 L, out float pdf, out int flags)
{
#if defined(OPT_MATERIALX) && !defined(OPT_PREVIEW)
    if (state.mat.materialType == MATERIAL_TYPE_MATERIALX)
        return SampleMtlxClosure(state.matID, state, V, N, L, pdf, flags);
    flags = 0;
    return DisneySample(state, V, N, L, pdf);
#else
    flags = 0;
    return DisneySample(state, V, N, L, pdf);
#endif
}

// NOTE: Kept available even under OPT_MATERIALX (mixed scenes). Sentinel guard
// never defined (was: #ifndef OPT_MATERIALX).
#ifndef OPT_DISABLE_BUILTIN_BSDF

vec3 LambertSample(inout State state, vec3 V, vec3 N, inout vec3 L, inout float pdf)
{
    float r1 = rand();
    float r2 = rand();

    vec3 T, B;
    Onb(N, T, B);

    L = CosineSampleHemisphere(r1, r2);
    L = T * L.x + B * L.y + N * L.z;

    pdf = dot(N, L) * (1.0 / PI);

    return (1.0 / PI) * state.mat.baseColor * dot(N, L);
}

vec3 LambertEval(State state, vec3 V, vec3 N, vec3 L, inout float pdf)
{
    pdf = dot(N, L) * (1.0 / PI);

    return (1.0 / PI) * state.mat.baseColor * dot(N, L);
}

#endif

// MaterialX closure definitions (EvalMtlxClosure/SampleMtlxClosure) are injected
// here from scene.proceduralMaterialGlsl under OPT_MATERIALX. See
// mtlx_closure.glsl for the forward declarations and the closure bridge.
/*__PROCEDURAL_MATERIAL_GENERATED_BEGIN__*/

struct BSDF { vec3 response; vec3 throughput; };
#define EDF vec3
struct VDF { vec3 response; vec3 throughput; };
struct surfaceshader { vec3 color; vec3 transparency; };
struct volumeshader { vec3 color; vec3 transparency; };
struct displacementshader { vec3 offset; float scale; };
struct lightshader { vec3 intensity; vec3 direction; };
#define material surfaceshader

uniform mat4 u_envMatrix;
uniform sampler2D u_envRadiance;
uniform float u_envLightIntensity;
uniform int u_envRadianceMips;
uniform int u_envRadianceSamples;
uniform sampler2D u_envIrradiance;
uniform bool u_refractionTwoSided;

#define M_FLOAT_EPS 1e-8
#define M_PI 3.1415926535897932

#define mx_mod mod
#define mx_inverse inverse
#define mx_inversesqrt inversesqrt
#define mx_sin sin
#define mx_cos cos
#define mx_tan tan
#define mx_asin asin
#define mx_acos acos
#define mx_atan atan
#define mx_radians radians
#define mx_float_bits_to_int floatBitsToInt

vec2 mx_matrix_mul(vec2 v, mat2 m) { return v * m; }
vec3 mx_matrix_mul(vec3 v, mat3 m) { return v * m; }
vec4 mx_matrix_mul(vec4 v, mat4 m) { return v * m; }
vec2 mx_matrix_mul(mat2 m, vec2 v) { return m * v; }
vec3 mx_matrix_mul(mat3 m, vec3 v) { return m * v; }
vec4 mx_matrix_mul(mat4 m, vec4 v) { return m * v; }
mat2 mx_matrix_mul(mat2 m1, mat2 m2) { return m1 * m2; }
mat3 mx_matrix_mul(mat3 m1, mat3 m2) { return m1 * m2; }
mat4 mx_matrix_mul(mat4 m1, mat4 m2) { return m1 * m2; }

float mx_square(float x)
{
    return x*x;
}

vec2 mx_square(vec2 x)
{
    return x*x;
}

vec3 mx_square(vec3 x)
{
    return x*x;
}

vec3 mx_srgb_encode(vec3 color)
{
    bvec3 isAbove = greaterThan(color, vec3(0.0031308));
    vec3 linSeg = color * 12.92;
    vec3 powSeg = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(linSeg, powSeg, isAbove);
}

#define DIRECTIONAL_ALBEDO_METHOD 0

#define AIRY_FRESNEL_ITERATIONS 2

#define M_PI 3.1415926535897932
#define M_PI_INV (1.0 / M_PI)

float mx_pow5(float x)
{
    return mx_square(mx_square(x)) * x;
}

float mx_pow6(float x)
{
    float x2 = mx_square(x);
    return mx_square(x2) * x2;
}

// Standard Schlick Fresnel
float mx_fresnel_schlick(float cosTheta, float F0)
{
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    float x5 = mx_pow5(x);
    return F0 + (1.0 - F0) * x5;
}
vec3 mx_fresnel_schlick(float cosTheta, vec3 F0)
{
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    float x5 = mx_pow5(x);
    return F0 + (1.0 - F0) * x5;
}

// Generalized Schlick Fresnel
float mx_fresnel_schlick(float cosTheta, float F0, float F90)
{
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    float x5 = mx_pow5(x);
    return mix(F0, F90, x5);
}
vec3 mx_fresnel_schlick(float cosTheta, vec3 F0, vec3 F90)
{
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    float x5 = mx_pow5(x);
    return mix(F0, F90, x5);
}

// Generalized Schlick Fresnel with a variable exponent
float mx_fresnel_schlick(float cosTheta, float F0, float F90, float exponent)
{
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    return mix(F0, F90, pow(x, exponent));
}
vec3 mx_fresnel_schlick(float cosTheta, vec3 F0, vec3 F90, float exponent)
{
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    return mix(F0, F90, pow(x, exponent));
}

// Enforce that the given normal is forward-facing from the specified view direction.
vec3 mx_forward_facing_normal(vec3 N, vec3 V)
{
    return (dot(N, V) < 0.0) ? -N : N;
}

// https://www.graphics.rwth-aachen.de/publication/2/jgt.pdf
float mx_golden_ratio_sequence(int i)
{
    const float GOLDEN_RATIO = 1.6180339887498948;
    return fract((float(i) + 1.0) * GOLDEN_RATIO);
}

// https://people.irisa.fr/Ricardo.Marques/articles/2013/SF_CGF.pdf
vec2 mx_spherical_fibonacci(int i, int numSamples)
{
    return vec2((float(i) + 0.5) / float(numSamples), mx_golden_ratio_sequence(i));
}

// Generate a uniform-weighted sample on the unit hemisphere.
vec3 mx_uniform_sample_hemisphere(vec2 Xi)
{
    float phi = 2.0 * M_PI * Xi.x;
    float cosTheta = 1.0 - Xi.y;
    float sinTheta = sqrt(1.0 - mx_square(cosTheta));
    return vec3(mx_cos(phi) * sinTheta,
                mx_sin(phi) * sinTheta,
                cosTheta);
}

// Generate a cosine-weighted sample on the unit hemisphere.
vec3 mx_cosine_sample_hemisphere(vec2 Xi)
{
    float phi = 2.0 * M_PI * Xi.x;
    float cosTheta = sqrt(Xi.y);
    float sinTheta = sqrt(1.0 - Xi.y);
    return vec3(mx_cos(phi) * sinTheta,
                mx_sin(phi) * sinTheta,
                cosTheta);
}

// PDF of a cosine-weighted hemisphere sample.
float mx_cosine_hemisphere_PDF(float cosTheta)
{
    return max(cosTheta, 0.0) * M_PI_INV;
}

// PDF of a uniform hemisphere sample.
float mx_uniform_hemisphere_PDF()
{
    return 0.5 * M_PI_INV;
}

// Construct an orthonormal basis from a unit vector.
// https://graphics.pixar.com/library/OrthonormalB/paper.pdf
mat3 mx_orthonormal_basis(vec3 N)
{
    float sign = (N.z < 0.0) ? -1.0 : 1.0;
    float a = -1.0 / (sign + N.z);
    float b = N.x * N.y * a;
    vec3 X = vec3(1.0 + sign * N.x * N.x * a, sign * b, -sign * N.x);
    vec3 Y = vec3(b, sign + N.y * N.y * a, -N.y);
    return mat3(X, Y, N);
}

const int FRESNEL_MODEL_DIELECTRIC = 0;
const int FRESNEL_MODEL_CONDUCTOR = 1;
const int FRESNEL_MODEL_SCHLICK = 2;

// Parameters for Fresnel calculations
struct FresnelData
{
    // Fresnel model
    int model;
    bool airy;

    // Physical Fresnel
    vec3 ior;
    vec3 extinction;

    // Generalized Schlick Fresnel
    vec3 F0;
    vec3 F82;
    vec3 F90;
    float exponent;

    // Thin film
    float tf_thickness;
    float tf_ior;

    // Refraction
    bool refraction;
};

// https://media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf
// Appendix B.2 Equation 13
float mx_ggx_NDF(vec3 H, vec2 alpha)
{
    vec2 He = H.xy / alpha;
    float denom = dot(He, He) + mx_square(H.z);
    return 1.0 / (M_PI * alpha.x * alpha.y * mx_square(denom));
}

// https://ggx-research.github.io/publication/2023/06/09/publication-ggx.html
vec3 mx_ggx_importance_sample_VNDF(vec2 Xi, vec3 V, vec2 alpha)
{
    // Transform the view direction to the hemisphere configuration.
    V = normalize(vec3(V.xy * alpha, V.z));

    // Sample a spherical cap in (-V.z, 1].
    float phi = 2.0 * M_PI * Xi.x;
    float z = (1.0 - Xi.y) * (1.0 + V.z) - V.z;
    float sinTheta = sqrt(clamp(1.0 - z * z, 0.0, 1.0));
    float x = sinTheta * mx_cos(phi);
    float y = sinTheta * mx_sin(phi);
    vec3 c = vec3(x, y, z);

    // Compute the microfacet normal.
    vec3 H = c + V;

    // Transform the microfacet normal back to the ellipsoid configuration.
    H = normalize(vec3(H.xy * alpha, max(H.z, 0.0)));

    return H;
}

// PDF of a reflection direction sampled from the GGX VNDF.
float mx_ggx_VNDF_reflection_PDF(vec3 H, vec2 alpha, float G1V, float NdotV)
{
    return mx_ggx_NDF(H, alpha) * G1V / (4.0 * NdotV);
}

// https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
// Equation 34
float mx_ggx_smith_G1(float cosTheta, float alpha)
{
    float cosTheta2 = mx_square(cosTheta);
    float tanTheta2 = (1.0 - cosTheta2) / cosTheta2;
    return 2.0 / (1.0 + sqrt(1.0 + mx_square(alpha) * tanTheta2));
}

// Height-correlated Smith masking-shadowing
// http://jcgt.org/published/0003/02/03/paper.pdf
// Equations 72 and 99
float mx_ggx_smith_G2(float NdotL, float NdotV, float alpha)
{
    float alpha2 = mx_square(alpha);
    float lambdaL = sqrt(alpha2 + (1.0 - alpha2) * mx_square(NdotL));
    float lambdaV = sqrt(alpha2 + (1.0 - alpha2) * mx_square(NdotV));
    return 2.0 * NdotL * NdotV / (lambdaL * NdotV + lambdaV * NdotL);
}

// Rational quadratic fit to Monte Carlo data for GGX directional albedo.
vec3 mx_ggx_dir_albedo_analytic(float NdotV, float alpha, vec3 F0, vec3 F90)
{
    float x = NdotV;
    float y = alpha;
    float x2 = mx_square(x);
    float y2 = mx_square(y);
    vec4 r = vec4(0.1003, 0.9345, 1.0, 1.0) +
             vec4(-0.6303, -2.323, -1.765, 0.2281) * x +
             vec4(9.748, 2.229, 8.263, 15.94) * y +
             vec4(-2.038, -3.748, 11.53, -55.83) * x * y +
             vec4(29.34, 1.424, 28.96, 13.08) * x2 +
             vec4(-8.245, -0.7684, -7.507, 41.26) * y2 +
             vec4(-26.44, 1.436, -36.11, 54.9) * x2 * y +
             vec4(19.99, 0.2913, 15.86, 300.2) * x * y2 +
             vec4(-5.448, 0.6286, 33.37, -285.1) * x2 * y2;
    vec2 AB = clamp(r.xy / r.zw, 0.0, 1.0);
    return F0 * AB.x + F90 * AB.y;
}

vec3 mx_ggx_dir_albedo_table_lookup(float NdotV, float alpha, vec3 F0, vec3 F90)
{
#if DIRECTIONAL_ALBEDO_METHOD == 1
    if (textureSize(u_albedoTable, 0).x > 1)
    {
        vec2 AB = texture(u_albedoTable, vec2(NdotV, alpha)).rg;
        return F0 * AB.x + F90 * AB.y;
    }
#endif
    return vec3(0.0);
}

// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
vec3 mx_ggx_dir_albedo_monte_carlo(float NdotV, float alpha, vec3 F0, vec3 F90)
{
    NdotV = clamp(NdotV, M_FLOAT_EPS, 1.0);
    vec3 V = vec3(sqrt(1.0 - mx_square(NdotV)), 0, NdotV);

    vec2 AB = vec2(0.0);
    const int SAMPLE_COUNT = 64;
    for (int i = 0; i < SAMPLE_COUNT; i++)
    {
        vec2 Xi = mx_spherical_fibonacci(i, SAMPLE_COUNT);

        // Compute the half vector and incoming light direction.
        vec3 H = mx_ggx_importance_sample_VNDF(Xi, V, vec2(alpha));
        vec3 L = -reflect(V, H);
        
        // Compute dot products for this sample.
        float NdotL = clamp(L.z, M_FLOAT_EPS, 1.0);
        float VdotH = clamp(dot(V, H), M_FLOAT_EPS, 1.0);

        // Compute the Fresnel term.
        float Fc = mx_fresnel_schlick(VdotH, 0.0, 1.0);

        // Compute the per-sample geometric term.
        // https://hal.inria.fr/hal-00996995v2/document, Algorithm 2
        float G2 = mx_ggx_smith_G2(NdotL, NdotV, alpha);
        
        // Add the contribution of this sample.
        AB += vec2(G2 * (1.0 - Fc), G2 * Fc);
    }

    // Apply the global component of the geometric term and normalize.
    AB /= mx_ggx_smith_G1(NdotV, alpha) * float(SAMPLE_COUNT);

    // Return the final directional albedo.
    return F0 * AB.x + F90 * AB.y;
}

vec3 mx_ggx_dir_albedo(float NdotV, float alpha, vec3 F0, vec3 F90)
{
#if DIRECTIONAL_ALBEDO_METHOD == 0
    return mx_ggx_dir_albedo_analytic(NdotV, alpha, F0, F90);
#elif DIRECTIONAL_ALBEDO_METHOD == 1
    return mx_ggx_dir_albedo_table_lookup(NdotV, alpha, F0, F90);
#else
    return mx_ggx_dir_albedo_monte_carlo(NdotV, alpha, F0, F90);
#endif
}

float mx_ggx_dir_albedo(float NdotV, float alpha, float F0, float F90)
{
    return mx_ggx_dir_albedo(NdotV, alpha, vec3(F0), vec3(F90)).x;
}

// Compute the average of an anisotropic alpha pair.
float mx_average_alpha(vec2 alpha)
{
    return sqrt(alpha.x * alpha.y);
}

// Convert a real-valued index of refraction to normal-incidence reflectivity.
float mx_ior_to_f0(float ior)
{
    return mx_square((ior - 1.0) / (ior + 1.0));
}

// Convert normal-incidence reflectivity to real-valued index of refraction.
float mx_f0_to_ior(float F0)
{
    float sqrtF0 = sqrt(clamp(F0, 0.01, 0.99));
    return (1.0 + sqrtF0) / (1.0 - sqrtF0);
}
vec3 mx_f0_to_ior(vec3 F0)
{
    vec3 sqrtF0 = sqrt(clamp(F0, 0.01, 0.99));
    return (vec3(1.0) + sqrtF0) / (vec3(1.0) - sqrtF0);
}

// https://renderwonk.com/publications/wp-generalization-adobe/gen-adobe.pdf
vec3 mx_fresnel_hoffman_schlick(float cosTheta, FresnelData fd)
{
    const float COS_THETA_MAX = 1.0 / 7.0;
    const float COS_THETA_FACTOR = 1.0 / (COS_THETA_MAX * pow(1.0 - COS_THETA_MAX, 6.0));

    float x = clamp(cosTheta, 0.0, 1.0);
    vec3 a = mix(fd.F0, fd.F90, pow(1.0 - COS_THETA_MAX, fd.exponent)) * (vec3(1.0) - fd.F82) * COS_THETA_FACTOR;
    return mix(fd.F0, fd.F90, pow(1.0 - x, fd.exponent)) - a * x * mx_pow6(1.0 - x);
}

// https://seblagarde.wordpress.com/2013/04/29/memo-on-fresnel-equations/
float mx_fresnel_dielectric(float cosTheta, float ior)
{
    float c = cosTheta;
    float g2 = ior*ior + c*c - 1.0;
    if (g2 < 0.0)
    {
        // Total internal reflection
        return 1.0;
    }

    float g = sqrt(g2);
    return 0.5 * mx_square((g - c) / (g + c)) *
                (1.0 + mx_square(((g + c) * c - 1.0) / ((g - c) * c + 1.0)));
}

// https://seblagarde.wordpress.com/2013/04/29/memo-on-fresnel-equations/
vec2 mx_fresnel_dielectric_polarized(float cosTheta, float ior)
{
    float cosTheta2 = mx_square(clamp(cosTheta, 0.0, 1.0));
    float sinTheta2 = 1.0 - cosTheta2;

    float t0 = max(ior * ior - sinTheta2, 0.0);
    float t1 = t0 + cosTheta2;
    float t2 = 2.0 * sqrt(t0) * cosTheta;
    float Rs = (t1 - t2) / (t1 + t2);

    float t3 = cosTheta2 * t0 + sinTheta2 * sinTheta2;
    float t4 = t2 * sinTheta2;
    float Rp = Rs * (t3 - t4) / (t3 + t4);

    return vec2(Rp, Rs);
}

// https://seblagarde.wordpress.com/2013/04/29/memo-on-fresnel-equations/
void mx_fresnel_conductor_polarized(float cosTheta, vec3 n, vec3 k, out vec3 Rp, out vec3 Rs)
{
    float cosTheta2 = mx_square(clamp(cosTheta, 0.0, 1.0));
    float sinTheta2 = 1.0 - cosTheta2;
    vec3 n2 = n * n;
    vec3 k2 = k * k;

    vec3 t0 = n2 - k2 - vec3(sinTheta2);
    vec3 a2plusb2 = sqrt(t0 * t0 + 4.0 * n2 * k2);
    vec3 t1 = a2plusb2 + vec3(cosTheta2);
    vec3 a = sqrt(max(0.5 * (a2plusb2 + t0), 0.0));
    vec3 t2 = 2.0 * a * cosTheta;
    Rs = (t1 - t2) / (t1 + t2);

    vec3 t3 = cosTheta2 * a2plusb2 + vec3(sinTheta2 * sinTheta2);
    vec3 t4 = t2 * sinTheta2;
    Rp = Rs * (t3 - t4) / (t3 + t4);
}

vec3 mx_fresnel_conductor(float cosTheta, vec3 n, vec3 k)
{
    vec3 Rp, Rs;
    mx_fresnel_conductor_polarized(cosTheta, n, k, Rp, Rs);
    return 0.5 * (Rp  + Rs);
}

// https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html
void mx_fresnel_conductor_phase_polarized(float cosTheta, float eta1, vec3 eta2, vec3 kappa2, out vec3 phiP, out vec3 phiS)
{
    vec3 k2 = kappa2 / eta2;
    vec3 sinThetaSqr = vec3(1.0) - cosTheta * cosTheta;
    vec3 A = eta2*eta2*(vec3(1.0)-k2*k2) - eta1*eta1*sinThetaSqr;
    vec3 B = sqrt(A*A + mx_square(2.0*eta2*eta2*k2));
    vec3 U = sqrt((A+B)/2.0);
    vec3 V = max(vec3(0.0), sqrt((B-A)/2.0));

    phiS = mx_atan(2.0*eta1*V*cosTheta, U*U + V*V - mx_square(eta1*cosTheta));
    phiP = mx_atan(2.0*eta1*eta2*eta2*cosTheta * (2.0*k2*U - (vec3(1.0)-k2*k2) * V),
                   mx_square(eta2*eta2*(vec3(1.0)+k2*k2)*cosTheta) - eta1*eta1*(U*U+V*V));
}

// https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html
vec3 mx_eval_sensitivity(float opd, vec3 shift)
{
    // Use Gaussian fits, given by 3 parameters: val, pos and var
    float phase = 2.0*M_PI * opd;
    vec3 val = vec3(5.4856e-13, 4.4201e-13, 5.2481e-13);
    vec3 pos = vec3(1.6810e+06, 1.7953e+06, 2.2084e+06);
    vec3 var = vec3(4.3278e+09, 9.3046e+09, 6.6121e+09);
    vec3 xyz = val * sqrt(2.0*M_PI * var) * mx_cos(pos * phase + shift) * exp(- var * phase*phase);
    xyz.x   += 9.7470e-14 * sqrt(2.0*M_PI * 4.5282e+09) * mx_cos(2.2399e+06 * phase + shift[0]) * exp(- 4.5282e+09 * phase*phase);
    return xyz / 1.0685e-7;
}

// A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence
// https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html
vec3 mx_fresnel_airy(float cosTheta, FresnelData fd)
{
    // XYZ to CIE 1931 RGB color space (using neutral E illuminant)
    const mat3 XYZ_TO_RGB = mat3(2.3706743, -0.5138850, 0.0052982, -0.9000405, 1.4253036, -0.0146949, -0.4706338, 0.0885814, 1.0093968);

    // Assume vacuum on the outside
    float eta1 = 1.0;
    float eta2 = max(fd.tf_ior, eta1);
    vec3 eta3 = (fd.model == FRESNEL_MODEL_SCHLICK) ? mx_f0_to_ior(fd.F0) : fd.ior;
    vec3 kappa3 = (fd.model == FRESNEL_MODEL_SCHLICK) ? vec3(0.0) : fd.extinction;
    float cosThetaT = sqrt(1.0 - (1.0 - mx_square(cosTheta)) * mx_square(eta1 / eta2));

    // First interface
    vec2 R12 = mx_fresnel_dielectric_polarized(cosTheta, eta2 / eta1);
    if (cosThetaT <= 0.0)
    {
        // Total internal reflection
        R12 = vec2(1.0);
    }
    vec2 T121 = vec2(1.0) - R12;

    // Second interface
    vec3 R23p, R23s;
    if (fd.model == FRESNEL_MODEL_SCHLICK)
    {
        vec3 f = mx_fresnel_hoffman_schlick(cosThetaT, fd);
        R23p = 0.5 * f;
        R23s = 0.5 * f;
    }
    else
    {
        mx_fresnel_conductor_polarized(cosThetaT, eta3 / eta2, kappa3 / eta2, R23p, R23s);
    }

    // Phase shift
    float cosB = mx_cos(mx_atan(eta2 / eta1));
    vec2 phi21 = vec2(cosTheta < cosB ? 0.0 : M_PI, M_PI);
    vec3 phi23p, phi23s;
    if (fd.model == FRESNEL_MODEL_SCHLICK)
    {
        phi23p = vec3((eta3[0] < eta2) ? M_PI : 0.0,
                      (eta3[1] < eta2) ? M_PI : 0.0,
                      (eta3[2] < eta2) ? M_PI : 0.0);
        phi23s = phi23p;
    }
    else
    {
        mx_fresnel_conductor_phase_polarized(cosThetaT, eta2, eta3, kappa3, phi23p, phi23s);
    }
    vec3 r123p = max(sqrt(R12.x*R23p), 0.0);
    vec3 r123s = max(sqrt(R12.y*R23s), 0.0);

    // Iridescence term
    vec3 I = vec3(0.0);
    vec3 Cm, Sm;

    // Optical path difference
    float distMeters = fd.tf_thickness * 1.0e-9;
    float opd = 2.0 * eta2 * cosThetaT * distMeters;

    // Iridescence term using spectral antialiasing for Parallel polarization

    // Reflectance term for m=0 (DC term amplitude)
    vec3 Rs = (mx_square(T121.x) * R23p) / (vec3(1.0) - R12.x*R23p);
    I += R12.x + Rs;

    // Reflectance term for m>0 (pairs of diracs)
    Cm = Rs - T121.x;
    for (int m = 1; m <= AIRY_FRESNEL_ITERATIONS; m++)
    {
        Cm *= r123p;
        Sm  = 2.0 * mx_eval_sensitivity(float(m) * opd, float(m)*(phi23p+vec3(phi21.x)));
        I  += Cm*Sm;
    }

    // Iridescence term using spectral antialiasing for Perpendicular polarization

    // Reflectance term for m=0 (DC term amplitude)
    vec3 Rp = (mx_square(T121.y) * R23s) / (vec3(1.0) - R12.y*R23s);
    I += R12.y + Rp;

    // Reflectance term for m>0 (pairs of diracs)
    Cm = Rp - T121.y;
    for (int m = 1; m <= AIRY_FRESNEL_ITERATIONS; m++)
    {
        Cm *= r123s;
        Sm  = 2.0 * mx_eval_sensitivity(float(m) * opd, float(m)*(phi23s+vec3(phi21.y)));
        I  += Cm*Sm;
    }

    // Average parallel and perpendicular polarization
    I *= 0.5;

    // Convert back to RGB reflectance
    I = clamp(mx_matrix_mul(XYZ_TO_RGB, I), 0.0, 1.0);

    return I;
}

FresnelData mx_init_fresnel_dielectric(float ior, float tf_thickness, float tf_ior)
{
    FresnelData fd;
    fd.model = FRESNEL_MODEL_DIELECTRIC;
    fd.airy = tf_thickness > 0.0;
    fd.ior = vec3(ior);
    fd.extinction = vec3(0.0);
    fd.F0 = vec3(0.0);
    fd.F82 = vec3(0.0);
    fd.F90 = vec3(0.0);
    fd.exponent = 0.0;
    fd.tf_thickness = tf_thickness;
    fd.tf_ior = tf_ior;
    fd.refraction = false;
    return fd;
}

FresnelData mx_init_fresnel_conductor(vec3 ior, vec3 extinction, float tf_thickness, float tf_ior)
{
    FresnelData fd;
    fd.model = FRESNEL_MODEL_CONDUCTOR;
    fd.airy = tf_thickness > 0.0;
    fd.ior = ior;
    fd.extinction = extinction;
    fd.F0 = vec3(0.0);
    fd.F82 = vec3(0.0);
    fd.F90 = vec3(0.0);
    fd.exponent = 0.0;
    fd.tf_thickness = tf_thickness;
    fd.tf_ior = tf_ior;
    fd.refraction = false;
    return fd;
}

FresnelData mx_init_fresnel_schlick(vec3 F0, vec3 F82, vec3 F90, float exponent, float tf_thickness, float tf_ior)
{
    FresnelData fd;
    fd.model = FRESNEL_MODEL_SCHLICK;
    fd.airy = tf_thickness > 0.0;
    fd.ior = vec3(0.0);
    fd.extinction = vec3(0.0);
    fd.F0 = F0;
    fd.F82 = F82;
    fd.F90 = F90;
    fd.exponent = exponent;
    fd.tf_thickness = tf_thickness;
    fd.tf_ior = tf_ior;
    fd.refraction = false;
    return fd;
}

vec3 mx_compute_fresnel(float cosTheta, FresnelData fd)
{
    if (fd.airy)
    {
         return mx_fresnel_airy(cosTheta, fd);
    }
    else if (fd.model == FRESNEL_MODEL_DIELECTRIC)
    {
        return vec3(mx_fresnel_dielectric(cosTheta, fd.ior.x));
    }
    else if (fd.model == FRESNEL_MODEL_CONDUCTOR)
    {
        return mx_fresnel_conductor(cosTheta, fd.ior, fd.extinction);
    }
    else // FRESNEL_MODEL_SCHLICK
    {
        return mx_fresnel_hoffman_schlick(cosTheta, fd);
    }
}

// Directional albedo accounting for different Fresnel functions.
vec3 mx_ggx_dir_albedo(float NdotV, float alpha, FresnelData fd)
{
    if (fd.airy)
    {
        // Approximation using a blend between mirror (alpha = 0)
        // and rougher cases. This helps to maintain angular
        // color variation at lower roughness values.
        vec3 mirrorDirAlbedo = mx_compute_fresnel(NdotV, fd);
        vec3 F0 = mx_fresnel_airy(1.0, fd);
        vec3 roughDirAlbedo = mx_ggx_dir_albedo(NdotV, alpha, F0, vec3(1.0));
        return mix(mirrorDirAlbedo, roughDirAlbedo, sqrt(alpha));
    }
    else if (fd.model == FRESNEL_MODEL_DIELECTRIC)
    {
        float F0 = mx_ior_to_f0(fd.ior.x);
        return mx_ggx_dir_albedo(NdotV, alpha, vec3(F0), vec3(1.0));
    }
    else if (fd.model == FRESNEL_MODEL_CONDUCTOR)
    {
        vec3 F0 = mx_fresnel_conductor(1.0, fd.ior, fd.extinction);
        return mx_ggx_dir_albedo(NdotV, alpha, F0, vec3(1.0));
    }
    else // FRESNEL_MODEL_SCHLICK
    {
        return mx_ggx_dir_albedo(NdotV, alpha, fd.F0, fd.F90);
    }
}

// Compute the cosine-weighted average of the Fresnel reflectance over the hemisphere.
// https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_slides_v2.pdf
vec3 mx_fresnel_average(FresnelData fd)
{
    vec3 F0 = mx_compute_fresnel(1.0, fd);
    vec3 F90 = (fd.model == FRESNEL_MODEL_SCHLICK && !fd.airy) ? fd.F90 : vec3(1.0);

    // The constant 1/21 is exact for a Schlick term with an exponent of 5, while for
    // a generalized Schlick exponent n it would be 2 / ((n + 1) * (n + 2)).
    return F0 + (F90 - F0) * (1.0 / 21.0);
}

// Multiple-scattering energy compensation for the GGX microfacet model.
// https://blog.selfshadow.com/publications/turquin/ms_comp_final.pdf
// Equations 14 and 16
vec3 mx_ggx_energy_compensation(float NdotV, float alpha, FresnelData fd)
{
    vec3 Fss = mx_fresnel_average(fd);
    float Ess = mx_ggx_dir_albedo(NdotV, alpha, 1.0, 1.0);
    return 1.0 + Fss * (1.0 - Ess) / Ess;
}

// Compute the refraction of a ray through a solid sphere.
vec3 mx_refraction_solid_sphere(vec3 R, vec3 N, float ior)
{
    R = refract(R, N, 1.0 / ior);
    vec3 N1 = normalize(R * dot(R, N) - N * 0.5);
    return refract(R, N1, ior);
}

vec2 mx_latlong_projection(vec3 dir)
{
    float latitude = -mx_asin(dir.y) * M_PI_INV + 0.5;
    float longitude = mx_atan(dir.x, -dir.z) * M_PI_INV * 0.5 + 0.5;
    return vec2(longitude, latitude);
}

vec3 mx_latlong_map_lookup(vec3 dir, mat4 transform, float lod, sampler2D tex_sampler)
{
    vec3 envDir = normalize(mx_matrix_mul(transform, vec4(dir,0.0)).xyz);
    vec2 uv = mx_latlong_projection(envDir);
    return textureLod(tex_sampler, uv, lod).rgb;
}

// Return the mip level with the appropriate coverage for a filtered importance sample.
// https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch20.html
// Section 20.4 Equation 13
float mx_latlong_compute_lod(vec3 dir, float pdf, float maxMipLevel, int envSamples)
{
    const float MIP_LEVEL_OFFSET = 1.5;
    float effectiveMaxMipLevel = maxMipLevel - MIP_LEVEL_OFFSET;
    float distortion = sqrt(1.0 - mx_square(dir.y));
    return max(effectiveMaxMipLevel - 0.5 * log2(float(envSamples) * pdf * distortion), 0.0);
}

vec3 mx_environment_radiance(vec3 N, vec3 V, vec3 X, vec2 alpha, int distribution, FresnelData fd)
{
    // Generate tangent frame.
    X = normalize(X - dot(X, N) * N);
    vec3 Y = cross(N, X);
    mat3 tangentToWorld = mat3(X, Y, N);

    // Transform the view vector to tangent space.
    V = vec3(dot(V, X), dot(V, Y), dot(V, N));

    // Compute derived properties.
    float NdotV = clamp(V.z, M_FLOAT_EPS, 1.0);
    float avgAlpha = mx_average_alpha(alpha);
    float G1V = mx_ggx_smith_G1(NdotV, avgAlpha);
    
    // Integrate outgoing radiance using filtered importance sampling.
    // http://cgg.mff.cuni.cz/~jaroslav/papers/2008-egsr-fis/2008-egsr-fis-final-embedded.pdf
    vec3 radiance = vec3(0.0);
    int envRadianceSamples = u_envRadianceSamples;
    for (int i = 0; i < envRadianceSamples; i++)
    {
        vec2 Xi = mx_spherical_fibonacci(i, envRadianceSamples);

        // Compute the half vector and incoming light direction.
        vec3 H = mx_ggx_importance_sample_VNDF(Xi, V, alpha);
        vec3 L = fd.refraction ? mx_refraction_solid_sphere(-V, H, fd.ior.x) : -reflect(V, H);
        
        // Compute dot products for this sample.
        float NdotL = clamp(L.z, M_FLOAT_EPS, 1.0);
        float VdotH = clamp(dot(V, H), M_FLOAT_EPS, 1.0);

        // Sample the environment light from the given direction.
        vec3 Lw = mx_matrix_mul(tangentToWorld, L);
        float pdf = mx_ggx_VNDF_reflection_PDF(H, alpha, G1V, NdotV);
        float lod = mx_latlong_compute_lod(Lw, pdf, float(u_envRadianceMips - 1), envRadianceSamples);
        vec3 sampleColor = mx_latlong_map_lookup(Lw, u_envMatrix, lod, u_envRadiance);

        // Compute the Fresnel term.
        vec3 F = mx_compute_fresnel(VdotH, fd);

        // Compute the geometric term.
        float G = mx_ggx_smith_G2(NdotL, NdotV, avgAlpha);

        // Compute the combined FG term, which simplifies to inverted Fresnel for refraction.
        vec3 FG = fd.refraction ? vec3(1.0) - F : F * G;

        // Add the radiance contribution of this sample.
        // From https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
        //   incidentLight = sampleColor * NdotL
        //   microfacetSpecular = D * F * G / (4 * NdotL * NdotV)
        //   pdf = D * G1V / (4 * NdotV);
        //   radiance = incidentLight * microfacetSpecular / pdf
        radiance += sampleColor * FG;
    }

    // Apply the global component of the geometric term and normalize.
    radiance /= G1V * float(envRadianceSamples);

    // Return the final radiance.
    return (u_envRadianceSamples == 0 ? vec3(0.0) : radiance) * u_envLightIntensity;
}

vec3 mx_environment_irradiance(vec3 N)
{
    vec3 Li = mx_latlong_map_lookup(N, u_envMatrix, 0.0, u_envIrradiance);
    return Li * u_envLightIntensity;
}


vec3 mx_surface_transmission(vec3 N, vec3 V, vec3 X, vec2 alpha, int distribution, FresnelData fd, vec3 tint)
{
    // Approximate the appearance of surface transmission as glossy
    // environment map refraction, ignoring any scene geometry that might
    // be visible through the surface.
    fd.refraction = true;
    if (u_refractionTwoSided)
    {
        tint = mx_square(tint);
    }
    return mx_environment_radiance(N, V, X, alpha, distribution, fd) * tint;
}

// Path tracer closure globals (set by the closure entry points).
vec3 g_ptV;
vec3 g_ptN;
vec3 g_ptL;
vec3 g_ptP;
vec3 g_ptTangent;
vec3 g_ptBitangent;
vec2 g_ptTexcoord;
int g_ptClosureType;
vec3 normalWorld;
vec3 tangentWorld;

vec3 base_color;
float metallic;
float roughness;
float occlusion;
float transmission;
float specular;
vec3 specular_color;
float ior;
float alpha;
int alpha_mode;
float alpha_cutoff;
float iridescence;
float iridescence_ior;
float iridescence_thickness;
vec3 sheen_color;
float sheen_roughness;
float clearcoat;
float clearcoat_roughness;
vec3 emissive;
float emissive_strength;
float thickness;
float attenuation_distance;
vec3 attenuation_color;
float anisotropy_strength;
float anisotropy_rotation;
float dispersion;

void pt_LoadParams(int matID)
{
    base_color = vec3(texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 0).x, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 0).y, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 0).z);
    metallic = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 0).w;
    roughness = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 1).x;
    occlusion = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 1).y;
    transmission = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 1).z;
    specular = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 1).w;
    specular_color = vec3(texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 2).x, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 2).y, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 2).z);
    ior = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 2).w;
    alpha = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 3).x;
    alpha_mode = int(texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 3).y + 0.5);
    alpha_cutoff = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 3).z;
    iridescence = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 3).w;
    iridescence_ior = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 4).x;
    iridescence_thickness = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 4).y;
    sheen_color = vec3(texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 4).z, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 4).w, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 5).x);
    sheen_roughness = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 5).y;
    clearcoat = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 5).z;
    clearcoat_roughness = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 5).w;
    emissive = vec3(texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 6).x, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 6).y, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 6).z);
    emissive_strength = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 6).w;
    thickness = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 7).x;
    attenuation_distance = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 7).y;
    attenuation_color = vec3(texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 7).z, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 7).w, texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 8).x);
    anisotropy_strength = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 8).y;
    anisotropy_rotation = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 8).z;
    dispersion = texelFetch1D(materialsTex, matID * MATERIALS_TEX_STRIDE + MAT_COMMON_VEC4 + 8).w;
}

// Lobe-selection material summary (assigned by pt_InitMaterialSummary).
float pt_mMetal = 0.0;
float pt_mSpecTrans = 0.0;
vec3 pt_mBaseColor = vec3(0.0);
vec3 pt_mSpecColor = vec3(0.0);
float pt_mSpecWeight = 0.0;
float pt_mRough = 0.0;
float pt_mTransExtraRough = 0.0;
vec3 pt_mTransColor = vec3(0.0);
bool pt_mThinWalled = false;

void mx_roughness_anisotropy(float roughness, float anisotropy, out vec2 result)
{
    float roughness_sqr = clamp(roughness*roughness, M_FLOAT_EPS, 1.0);
    if (anisotropy > 0.0)
    {
        float aspect = sqrt(1.0 - clamp(anisotropy, 0.0, 0.98));
        result.x = min(roughness_sqr / aspect, 1.0);
        result.y = roughness_sqr * aspect;
    }
    else
    {
        result.x = roughness_sqr;
        result.y = roughness_sqr;
    }
}

void NG_separate3_color3(vec3 in1, out float outr, out float outg, out float outb)
{
    const int N_extract_0_index_tmp = 0;
    float N_extract_0_out = in1[N_extract_0_index_tmp];
    const int N_extract_1_index_tmp = 1;
    float N_extract_1_out = in1[N_extract_1_index_tmp];
    const int N_extract_2_index_tmp = 2;
    float N_extract_2_out = in1[N_extract_2_index_tmp];
    outr = N_extract_0_out;
    outg = N_extract_1_out;
    outb = N_extract_2_out;
}

void NG_maxcomponent_color3(vec3 in1, out float out1)
{
    float N_separate_outr = 0.0;
    float N_separate_outg = 0.0;
    float N_separate_outb = 0.0;
    NG_separate3_color3(in1, N_separate_outr, N_separate_outg, N_separate_outb);
    float N_max_01_out = max(N_separate_outr, N_separate_outg);
    float N_max_out = max(N_max_01_out, N_separate_outb);
    out1 = N_max_out;
}

// These are defined based on the HwShaderGenerator::ClosureContextType enum
// if that changes - these need to be updated accordingly.

#define CLOSURE_TYPE_DEFAULT 0
#define CLOSURE_TYPE_REFLECTION 1
#define CLOSURE_TYPE_TRANSMISSION 2
#define CLOSURE_TYPE_INDIRECT 3
#define CLOSURE_TYPE_EMISSION 4

struct ClosureData {
    int closureType;
    vec3 L;
    vec3 V;
    vec3 N;
    vec3 P;
    float occlusion;
};

ClosureData makeClosureData(int closureType, vec3 L, vec3 V, vec3 N, vec3 P, float occlusion)
{
    return ClosureData(closureType, L, V, N, P, occlusion);
}

void mx_dielectric_bsdf(ClosureData closureData, float weight, vec3 tint, float ior, vec2 roughness, bool retroreflective, float thinfilm_thickness, float thinfilm_ior, vec3 N, vec3 X, int distribution, int scatter_mode, inout BSDF bsdf)
{
    if (weight < M_FLOAT_EPS)
    {
        return;
    }
    if (closureData.closureType != CLOSURE_TYPE_TRANSMISSION && scatter_mode == 1)
    {
        return;
    }

    vec3 V = closureData.V;
    vec3 L = closureData.L;

    // Retroreflective mode is only supported for reflection and indirect
    if (retroreflective && (closureData.closureType != CLOSURE_TYPE_TRANSMISSION))
        V = reflect(-V, N);
    
    N = mx_forward_facing_normal(N, V);
    float NdotV = clamp(dot(N, V), M_FLOAT_EPS, 1.0);

    FresnelData fd = mx_init_fresnel_dielectric(ior, thinfilm_thickness, thinfilm_ior);
    float F0 = mx_ior_to_f0(ior);

    vec2 safeAlpha = clamp(roughness, M_FLOAT_EPS, 1.0);
    float avgAlpha = mx_average_alpha(safeAlpha);
    vec3 safeTint = max(tint, 0.0);

    if (closureData.closureType == CLOSURE_TYPE_REFLECTION)
    {
        X = normalize(X - dot(X, N) * N);
        vec3 Y = cross(N, X);
        vec3 H = normalize(L + V);

        float NdotL = clamp(dot(N, L), M_FLOAT_EPS, 1.0);
        float VdotH = clamp(dot(V, H), M_FLOAT_EPS, 1.0);

        vec3 Ht = vec3(dot(H, X), dot(H, Y), dot(H, N));

        vec3 F = mx_compute_fresnel(VdotH, fd);
        float D = mx_ggx_NDF(Ht, safeAlpha);
        float G = mx_ggx_smith_G2(NdotL, NdotV, avgAlpha);

        vec3 comp = mx_ggx_energy_compensation(NdotV, avgAlpha, fd);
        vec3 dirAlbedo = mx_ggx_dir_albedo(NdotV, avgAlpha, F0, 1.0) * comp;
        bsdf.throughput = 1.0 - dirAlbedo * weight;

        bsdf.response = D * F * G * comp * safeTint * closureData.occlusion * weight / (4.0 * NdotV);
    }
    else if (closureData.closureType == CLOSURE_TYPE_TRANSMISSION)
    {
        vec3 comp = mx_ggx_energy_compensation(NdotV, avgAlpha, fd);
        vec3 dirAlbedo = mx_ggx_dir_albedo(NdotV, avgAlpha, F0, 1.0) * comp;
        bsdf.throughput = 1.0 - dirAlbedo * weight;

        if (scatter_mode != 0)
        {
            bsdf.response = mx_surface_transmission(N, V, X, safeAlpha, distribution, fd, safeTint) * weight;
        }
    }
    else if (closureData.closureType == CLOSURE_TYPE_INDIRECT)
    {
        vec3 comp = mx_ggx_energy_compensation(NdotV, avgAlpha, fd);
        vec3 dirAlbedo = mx_ggx_dir_albedo(NdotV, avgAlpha, F0, 1.0) * comp;
        bsdf.throughput = 1.0 - dirAlbedo * weight;

        vec3 Li = mx_environment_radiance(N, V, X, safeAlpha, distribution, fd);
        bsdf.response = Li * safeTint * comp * weight;
    }
}

void mx_rotate_vector3(vec3 _in, float amount, vec3 axis, out vec3 result)
{
    // Based on https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula, where the
    // Wikipedia formula follows v' = M * v and MaterialX follows v' = v * M, thus the
    // order of parameters to cross are reversed.

    axis = normalize(axis);
    float rotationRadians = mx_radians(amount);
    float s = mx_sin(rotationRadians);
    float c = mx_cos(rotationRadians);
    float oc = 1.0 - c;
    result = _in * c + cross(_in, axis) * s + axis * dot(axis, _in) * oc;
}


void mx_uniform_edf(ClosureData closureData, vec3 color, out EDF result)
{
    if (closureData.closureType == CLOSURE_TYPE_EMISSION)
    {
        result = color;
    }
}


// https://fpsunflower.github.io/ckulla/data/s2017_pbs_imageworks_sheen.pdf
// Equation 2
float mx_imageworks_sheen_NDF(float NdotH, float roughness)
{
    float invRoughness = 1.0 / max(roughness, 0.005);
    float cos2 = NdotH * NdotH;
    float sin2 = 1.0 - cos2;
    return (2.0 + invRoughness) * pow(sin2, invRoughness * 0.5) / (2.0 * M_PI);
}

float mx_imageworks_sheen_brdf(float NdotL, float NdotV, float NdotH, float roughness)
{
    // Microfacet distribution.
    float D = mx_imageworks_sheen_NDF(NdotH, roughness);

    // Fresnel and geometry terms are ignored.
    float F = 1.0;
    float G = 1.0;

    // We use a smoother denominator, as in:
    // https://blog.selfshadow.com/publications/s2013-shading-course/rad/s2013_pbs_rad_notes.pdf
    return D * F * G / (4.0 * (NdotL + NdotV - NdotL*NdotV));
}

// Rational quadratic fit to Monte Carlo data for Imageworks sheen directional albedo.
float mx_imageworks_sheen_dir_albedo_analytic(float NdotV, float roughness)
{
    vec2 r = vec2(13.67300, 1.0) +
             vec2(-68.78018, 61.57746) * NdotV +
             vec2(799.08825, 442.78211) * roughness +
             vec2(-905.00061, 2597.49308) * NdotV * roughness +
             vec2(60.28956, 121.81241) * mx_square(NdotV) +
             vec2(1086.96473, 3045.55075) * mx_square(roughness);
    return r.x / r.y;
}

float mx_imageworks_sheen_dir_albedo_table_lookup(float NdotV, float roughness)
{
#if DIRECTIONAL_ALBEDO_METHOD == 1
    if (textureSize(u_albedoTable, 0).x > 1)
    {
        return texture(u_albedoTable, vec2(NdotV, roughness)).b;
    }
#endif
    return 0.0;
}

float mx_imageworks_sheen_dir_albedo_monte_carlo(float NdotV, float roughness)
{
    NdotV = clamp(NdotV, M_FLOAT_EPS, 1.0);
    vec3 V = vec3(sqrt(1.0f - mx_square(NdotV)), 0, NdotV);

    float radiance = 0.0;
    const int SAMPLE_COUNT = 64;
    for (int i = 0; i < SAMPLE_COUNT; i++)
    {
        vec2 Xi = mx_spherical_fibonacci(i, SAMPLE_COUNT);

        // Compute the incoming light direction and half vector.
        vec3 L = mx_uniform_sample_hemisphere(Xi);
        vec3 H = normalize(L + V);
        
        // Compute dot products for this sample.
        float NdotL = clamp(L.z, M_FLOAT_EPS, 1.0);
        float NdotH = clamp(H.z, M_FLOAT_EPS, 1.0);

        // Compute sheen reflectance.
        float reflectance = mx_imageworks_sheen_brdf(NdotL, NdotV, NdotH, roughness);

        // Add the radiance contribution of this sample.
        //   radiance = reflectance * NdotL / uniform_pdf;
        radiance += reflectance * NdotL / mx_uniform_hemisphere_PDF();
    }

    // Return the final directional albedo.
    return radiance / float(SAMPLE_COUNT);
}

float mx_imageworks_sheen_dir_albedo(float NdotV, float roughness)
{
#if DIRECTIONAL_ALBEDO_METHOD == 0
    float dirAlbedo = mx_imageworks_sheen_dir_albedo_analytic(NdotV, roughness);
#elif DIRECTIONAL_ALBEDO_METHOD == 1
    float dirAlbedo = mx_imageworks_sheen_dir_albedo_table_lookup(NdotV, roughness);
#else
    float dirAlbedo = mx_imageworks_sheen_dir_albedo_monte_carlo(NdotV, roughness);
#endif
    return clamp(dirAlbedo, 0.0, 1.0);
}

// The following functions are adapted from https://github.com/tizian/ltc-sheen.
// "Practical Multiple-Scattering Sheen Using Linearly Transformed Cosines", Zeltner et al.

// Gaussian fit to directional albedo table.
float mx_zeltner_sheen_dir_albedo(float x, float y)
{
    float s = y*(0.0206607 + 1.58491*y)/(0.0379424 + y*(1.32227 + y));
    float m = y*(-0.193854 + y*(-1.14885 + y*(1.7932 - 0.95943*y*y)))/(0.046391 + y);
    float o = y*(0.000654023 + (-0.0207818 + 0.119681*y)*y)/(1.26264 + y*(-1.92021 + y));
    return exp(-0.5*mx_square((x - m)/s))/(s*sqrt(2.0*M_PI)) + o;
}

// Rational fits to LTC matrix coefficients.
float mx_zeltner_sheen_ltc_aInv(float x, float y)
{
    return (2.58126*x + 0.813703*y)*y/(1.0 + 0.310327*x*x + 2.60994*x*y);
}

float mx_zeltner_sheen_ltc_bInv(float x, float y)
{
    return sqrt(1.0 - x)*(y - 1.0)*y*y*y/(0.0000254053 + 1.71228*x - 1.71506*x*y + 1.34174*y*y);
}

// V and N are assumed to be unit vectors.
mat3 mx_orthonormal_basis_ltc(vec3 V, vec3 N, float NdotV)
{
    // Generate a tangent vector in the plane of V and N.
    // This required to correctly orient the LTC lobe.
    vec3 X = V - N*NdotV;
    float lenSqr = dot(X, X);
    if (lenSqr > 0.0)
    {
        X *= mx_inversesqrt(lenSqr);
        vec3 Y = cross(N, X);
        return mat3(X, Y, N);
    }

    // If lenSqr == 0, then V == N, so any orthonormal basis will do.
    return mx_orthonormal_basis(N);
}

// Multiplication by directional albedo is handled by the calling function.
float mx_zeltner_sheen_brdf(vec3 L, vec3 V, vec3 N, float NdotV, float roughness)
{
    mat3 toLTC = transpose(mx_orthonormal_basis_ltc(V, N, NdotV));
    vec3 w = mx_matrix_mul(toLTC, L);

    float aInv = mx_zeltner_sheen_ltc_aInv(NdotV, roughness);
    float bInv = mx_zeltner_sheen_ltc_bInv(NdotV, roughness);

    // Transform w to original configuration (clamped cosine).
    //                 |aInv    0 bInv|
    // wo = M^-1 . w = |   0 aInv    0| . w
    //                 |   0    0    1|
    vec3 wo = vec3(aInv*w.x + bInv*w.z, aInv * w.y, w.z);
    float lenSqr = dot(wo, wo);

    // D(w) = Do(M^-1.w / ||M^-1.w||) . |M^-1| / ||M^-1.w||^3
    //      = Do(M^-1.w) . |M^-1| / ||M^-1.w||^4
    //      = Do(wo) . |M^-1| / dot(wo, wo)^2
    //      = Do(wo) . aInv^2 / dot(wo, wo)^2
    //      = Do(wo) . (aInv / dot(wo, wo))^2
    return mx_cosine_hemisphere_PDF(wo.z) * mx_square(aInv / lenSqr);
}

vec3 mx_zeltner_sheen_importance_sample(vec2 Xi, vec3 V, vec3 N, float roughness, out float pdf)
{
    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    roughness = clamp(roughness, 0.01, 1.0); // Clamp to range of original impl.

    vec3 wo = mx_cosine_sample_hemisphere(Xi);

    float aInv = mx_zeltner_sheen_ltc_aInv(NdotV, roughness);
    float bInv = mx_zeltner_sheen_ltc_bInv(NdotV, roughness);

    // Transform wo from original configuration (clamped cosine).
    //              |1/aInv      0 -bInv/aInv|
    // w = M . wo = |     0 1/aInv          0| . wo
    //              |     0      0          1|    
    vec3 w = vec3(wo.x/aInv - wo.z*bInv/aInv, wo.y / aInv, wo.z);

    float lenSqr = dot(w, w);
    w *= mx_inversesqrt(lenSqr);

    // D(w) = Do(wo) . ||M.wo||^3 / |M|
    //      = Do(wo / ||M.wo||) . ||M.wo||^4 / |M| 
    //      = Do(w) . ||M.wo||^4 / |M| (possible because M doesn't change z component)
    //      = Do(w) . dot(w, w)^2 * aInv^2
    //      = Do(w) . (aInv * dot(w, w))^2
    pdf = mx_cosine_hemisphere_PDF(w.z) * mx_square(aInv * lenSqr);

    mat3 fromLTC = mx_orthonormal_basis_ltc(V, N, NdotV);
    w = mx_matrix_mul(fromLTC, w);

    return w;
}

void mx_sheen_bsdf(ClosureData closureData, float weight, vec3 color, float roughness, vec3 N, int mode, inout BSDF bsdf)
{
    if (weight < M_FLOAT_EPS)
    {
        return;
    }

    vec3 V = closureData.V;
    vec3 L = closureData.L;

    N = mx_forward_facing_normal(N, V);
    float NdotV = clamp(dot(N, V), M_FLOAT_EPS, 1.0);

    if (closureData.closureType == CLOSURE_TYPE_REFLECTION)
    {
        float dirAlbedo;
        if (mode == 0)
        {
            vec3 H = normalize(L + V);

            float NdotL = clamp(dot(N, L), M_FLOAT_EPS, 1.0);
            float NdotH = clamp(dot(N, H), M_FLOAT_EPS, 1.0);

            vec3 fr = color * mx_imageworks_sheen_brdf(NdotL, NdotV, NdotH, roughness);
            dirAlbedo = mx_imageworks_sheen_dir_albedo(NdotV, roughness);

            // We need to include NdotL from the light integral here
            // as in this case it's not cancelled out by the BRDF denominator.
            bsdf.response = fr * NdotL * closureData.occlusion * weight;
        }
        else
        {
            roughness = clamp(roughness, 0.01, 1.0); // Clamp to range of original impl.

            vec3 fr = color * mx_zeltner_sheen_brdf(L, V, N, NdotV, roughness);
            dirAlbedo = mx_zeltner_sheen_dir_albedo(NdotV, roughness);
            bsdf.response = dirAlbedo * fr * closureData.occlusion * weight;
        }
        bsdf.throughput = vec3(1.0 - dirAlbedo * weight);
    }
    else if (closureData.closureType == CLOSURE_TYPE_INDIRECT)
    {
        float dirAlbedo;
        if (mode == 0)
        {
            dirAlbedo = mx_imageworks_sheen_dir_albedo(NdotV, roughness);
        }
        else
        {
            roughness = clamp(roughness, 0.01, 1.0); // Clamp to range of original impl.
            dirAlbedo = mx_zeltner_sheen_dir_albedo(NdotV, roughness);
        }

        vec3 Li = mx_environment_irradiance(N);
        bsdf.response = Li * color * dirAlbedo * weight;
        bsdf.throughput = vec3(1.0 - dirAlbedo * weight);
    }
}


const float FUJII_CONSTANT_1 = 0.5 - 2.0 / (3.0 * M_PI);
const float FUJII_CONSTANT_2 = 2.0 / 3.0 - 28.0 / (15.0 * M_PI);

// Qualitative Oren-Nayar diffuse with simplified math:
// https://www1.cs.columbia.edu/CAVE/publications/pdfs/Oren_SIGGRAPH94.pdf
float mx_oren_nayar_diffuse(float NdotV, float NdotL, float LdotV, float roughness)
{
    float s = LdotV - NdotL * NdotV;
    float stinv = (s > 0.0) ? s / max(NdotL, NdotV) : 0.0;

    float sigma2 = mx_square(roughness);
    float A = 1.0 - 0.5 * (sigma2 / (sigma2 + 0.33));
    float B = 0.45 * sigma2 / (sigma2 + 0.09);

    return A + B * stinv;
}

// Rational quadratic fit to Monte Carlo data for Oren-Nayar directional albedo.
float mx_oren_nayar_diffuse_dir_albedo_analytic(float NdotV, float roughness)
{
    vec2 r = vec2(1.0, 1.0) +
             vec2(-0.4297, -0.6076) * roughness +
             vec2(-0.7632, -0.4993) * NdotV * roughness +
             vec2(1.4385, 2.0315) * mx_square(roughness);
    return r.x / r.y;
}

float mx_oren_nayar_diffuse_dir_albedo_table_lookup(float NdotV, float roughness)
{
#if DIRECTIONAL_ALBEDO_METHOD == 1
    if (textureSize(u_albedoTable, 0).x > 1)
    {
        return texture(u_albedoTable, vec2(NdotV, roughness)).b;
    }
#endif
    return 0.0;
}

float mx_oren_nayar_diffuse_dir_albedo_monte_carlo(float NdotV, float roughness)
{
    NdotV = clamp(NdotV, M_FLOAT_EPS, 1.0);
    vec3 V = vec3(sqrt(1.0 - mx_square(NdotV)), 0, NdotV);

    float radiance = 0.0;
    const int SAMPLE_COUNT = 64;
    for (int i = 0; i < SAMPLE_COUNT; i++)
    {
        vec2 Xi = mx_spherical_fibonacci(i, SAMPLE_COUNT);

        // Compute the incoming light direction.
        vec3 L = mx_uniform_sample_hemisphere(Xi);
        
        // Compute dot products for this sample.
        float NdotL = clamp(L.z, M_FLOAT_EPS, 1.0);
        float LdotV = clamp(dot(L, V), M_FLOAT_EPS, 1.0);

        // Compute diffuse reflectance.
        float reflectance = mx_oren_nayar_diffuse(NdotV, NdotL, LdotV, roughness);

        // Add the radiance contribution of this sample.
        //   uniform_pdf = 1 / (2 * PI)
        //   radiance = (reflectance * NdotL) / (uniform_pdf * PI);
        radiance += reflectance * NdotL;
    }

    // Apply global components and normalize.
    radiance *= 2.0 / float(SAMPLE_COUNT);

    // Return the final directional albedo.
    return radiance;
}

float mx_oren_nayar_diffuse_dir_albedo(float NdotV, float roughness)
{
#if DIRECTIONAL_ALBEDO_METHOD == 2
    float dirAlbedo = mx_oren_nayar_diffuse_dir_albedo_monte_carlo(NdotV, roughness);
#else
    float dirAlbedo = mx_oren_nayar_diffuse_dir_albedo_analytic(NdotV, roughness);
#endif
    return clamp(dirAlbedo, 0.0, 1.0);
}

// Improved Oren-Nayar diffuse from Fujii:
// https://mimosa-pudica.net/improved-oren-nayar.html
float mx_oren_nayar_fujii_diffuse_dir_albedo(float cosTheta, float roughness)
{
    float A = 1.0 / (1.0 + FUJII_CONSTANT_1 * roughness);
    float B = roughness * A;
    float Si = sqrt(max(0.0, 1.0 - mx_square(cosTheta)));
    float G = Si * (mx_acos(clamp(cosTheta, -1.0, 1.0)) - Si * cosTheta) +
              2.0 * ((Si / cosTheta) * (1.0 - Si * Si * Si) - Si) / 3.0;
    return A + (B * G * M_PI_INV);
}

float mx_oren_nayar_fujii_diffuse_avg_albedo(float roughness)
{
    float A = 1.0 / (1.0 + FUJII_CONSTANT_1 * roughness);
    return A * (1.0 + FUJII_CONSTANT_2 * roughness);
}   

// Energy-compensated Oren-Nayar diffuse from OpenPBR Surface:
// https://academysoftwarefoundation.github.io/OpenPBR/
vec3 mx_oren_nayar_compensated_diffuse(float NdotV, float NdotL, float LdotV, float roughness, vec3 color)
{
    float s = LdotV - NdotL * NdotV;
    float stinv = (s > 0.0) ? s / max(NdotL, NdotV) : s;

    // Compute the single-scatter lobe.
    float A = 1.0 / (1.0 + FUJII_CONSTANT_1 * roughness);
    vec3 lobeSingleScatter = color * A * (1.0 + roughness * stinv);

    // Compute the multi-scatter lobe.
    float dirAlbedoV = mx_oren_nayar_fujii_diffuse_dir_albedo(NdotV, roughness);
    float dirAlbedoL = mx_oren_nayar_fujii_diffuse_dir_albedo(NdotL, roughness);
    float avgAlbedo = mx_oren_nayar_fujii_diffuse_avg_albedo(roughness);
    vec3 colorMultiScatter = mx_square(color) * avgAlbedo /
                             (vec3(1.0) - color * max(0.0, 1.0 - avgAlbedo));
    vec3 lobeMultiScatter = colorMultiScatter *
                            max(M_FLOAT_EPS, 1.0 - dirAlbedoV) *
                            max(M_FLOAT_EPS, 1.0 - dirAlbedoL) /
                            max(M_FLOAT_EPS, 1.0 - avgAlbedo);

    // Return the sum.
    return lobeSingleScatter + lobeMultiScatter;
}

vec3 mx_oren_nayar_compensated_diffuse_dir_albedo(float cosTheta, float roughness, vec3 color)
{
    float dirAlbedo = mx_oren_nayar_fujii_diffuse_dir_albedo(cosTheta, roughness);
    float avgAlbedo = mx_oren_nayar_fujii_diffuse_avg_albedo(roughness);
    vec3 colorMultiScatter = mx_square(color) * avgAlbedo /
                             (vec3(1.0) - color * max(0.0, 1.0 - avgAlbedo));
    return mix(colorMultiScatter, color, dirAlbedo);
}
  
// https://media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf
// Section 5.3
float mx_burley_diffuse(float NdotV, float NdotL, float LdotH, float roughness)
{
    float F90 = 0.5 + (2.0 * roughness * mx_square(LdotH));
    float refL = mx_fresnel_schlick(NdotL, 1.0, F90);
    float refV = mx_fresnel_schlick(NdotV, 1.0, F90);
    return refL * refV;
}

// Compute the directional albedo component of Burley diffuse for the given
// view angle and roughness.  Curve fit provided by Stephen Hill.
float mx_burley_diffuse_dir_albedo(float NdotV, float roughness)
{
    float x = NdotV;
    float fit0 = 0.97619 - 0.488095 * mx_pow5(1.0 - x);
    float fit1 = 1.55754 + (-2.02221 + (2.56283 - 1.06244 * x) * x) * x;
    return mix(fit0, fit1, roughness);
}

// Evaluate the Burley diffusion profile for the given distance and diffusion shape.
// Based on https://graphics.pixar.com/library/ApproxBSSRDF/
vec3 mx_burley_diffusion_profile(float dist, vec3 shape)
{
    vec3 num1 = exp(-shape * dist);
    vec3 num2 = exp(-shape * dist / 3.0);
    float denom = max(dist, M_FLOAT_EPS);
    return (num1 + num2) / denom;
}

// Integrate the Burley diffusion profile over a sphere of the given radius.
// Inspired by Eric Penner's presentation in http://advances.realtimerendering.com/s2011/
vec3 mx_integrate_burley_diffusion(vec3 N, vec3 L, float radius, vec3 mfp)
{
    float theta = mx_acos(dot(N, L));

    // Estimate the Burley diffusion shape from mean free path.
    vec3 shape = vec3(1.0) / max(mfp, 0.1);

    // Integrate the profile over the sphere.
    vec3 sumD = vec3(0.0);
    vec3 sumR = vec3(0.0);
    const int SAMPLE_COUNT = 32;
    const float SAMPLE_WIDTH = (2.0 * M_PI) / float(SAMPLE_COUNT);
    for (int i = 0; i < SAMPLE_COUNT; i++)
    {
        float x = -M_PI + (float(i) + 0.5) * SAMPLE_WIDTH;
        float dist = radius * abs(2.0 * mx_sin(x * 0.5));
        vec3 R = mx_burley_diffusion_profile(dist, shape);
        sumD += R * max(mx_cos(theta + x), 0.0);
        sumR += R;
    }

    return sumD / sumR;
}

vec3 mx_subsurface_scattering_approx(vec3 N, vec3 L, vec3 P, vec3 albedo, vec3 mfp)
{
    float curvature = length(fwidth(N)) / length(fwidth(P));
    float radius = 1.0 / max(curvature, 0.01);
    return albedo * mx_integrate_burley_diffusion(N, L, radius, mfp) / vec3(M_PI);
}

void mx_oren_nayar_diffuse_bsdf(ClosureData closureData, float weight, vec3 color, float roughness, vec3 N, bool energy_compensation, inout BSDF bsdf)
{
    bsdf.throughput = vec3(0.0);

    if (weight < M_FLOAT_EPS)
    {
        return;
    }

    vec3 V = closureData.V;
    vec3 L = closureData.L;

    N = mx_forward_facing_normal(N, V);
    float NdotV = clamp(dot(N, V), M_FLOAT_EPS, 1.0);

    if (closureData.closureType == CLOSURE_TYPE_REFLECTION)
    {
        float NdotL = clamp(dot(N, L), M_FLOAT_EPS, 1.0);
        float LdotV = clamp(dot(L, V), M_FLOAT_EPS, 1.0);

        vec3 diffuse = energy_compensation ?
                       mx_oren_nayar_compensated_diffuse(NdotV, NdotL, LdotV, roughness, color) :
                       mx_oren_nayar_diffuse(NdotV, NdotL, LdotV, roughness) * color;
        bsdf.response = diffuse * closureData.occlusion * weight * NdotL * M_PI_INV;
    }
    else if (closureData.closureType == CLOSURE_TYPE_INDIRECT)
    {
        vec3 diffuse = energy_compensation ?
                       mx_oren_nayar_compensated_diffuse_dir_albedo(NdotV, roughness, color) :
                       mx_oren_nayar_diffuse_dir_albedo(NdotV, roughness) * color;
        vec3 Li = mx_environment_irradiance(N);
        bsdf.response = Li * diffuse * weight;
    }
}


void mx_generalized_schlick_bsdf(ClosureData closureData, float weight, vec3 color0, vec3 color82, vec3 color90, float exponent, vec2 roughness, bool retroreflective, float thinfilm_thickness, float thinfilm_ior, vec3 N, vec3 X, int distribution, int scatter_mode, inout BSDF bsdf)
{
    if (weight < M_FLOAT_EPS)
    {
        return;
    }
    if (closureData.closureType != CLOSURE_TYPE_TRANSMISSION && scatter_mode == 1)
    {
        return;
    }

    vec3 V = closureData.V;
    vec3 L = closureData.L;

    // Retroreflective mode is only supported for reflection and indirect
    if (retroreflective && (closureData.closureType != CLOSURE_TYPE_TRANSMISSION))
        V = reflect(-V, N);
    
    N = mx_forward_facing_normal(N, V);
    float NdotV = clamp(dot(N, V), M_FLOAT_EPS, 1.0);

    vec3 safeColor0 = max(color0, 0.0);
    vec3 safeColor82 = max(color82, 0.0);
    vec3 safeColor90 = max(color90, 0.0);
    FresnelData fd = mx_init_fresnel_schlick(safeColor0, safeColor82, safeColor90, exponent, thinfilm_thickness, thinfilm_ior);

    vec2 safeAlpha = clamp(roughness, M_FLOAT_EPS, 1.0);
    float avgAlpha = mx_average_alpha(safeAlpha);

    if (closureData.closureType == CLOSURE_TYPE_REFLECTION)
    {
        X = normalize(X - dot(X, N) * N);
        vec3 Y = cross(N, X);
        vec3 H = normalize(L + V);

        float NdotL = clamp(dot(N, L), M_FLOAT_EPS, 1.0);
        float VdotH = clamp(dot(V, H), M_FLOAT_EPS, 1.0);

        vec3 Ht = vec3(dot(H, X), dot(H, Y), dot(H, N));

        vec3  F = mx_compute_fresnel(VdotH, fd);
        float D = mx_ggx_NDF(Ht, safeAlpha);
        float G = mx_ggx_smith_G2(NdotL, NdotV, avgAlpha);

        vec3 comp = mx_ggx_energy_compensation(NdotV, avgAlpha, fd);
        vec3 dirAlbedo = mx_ggx_dir_albedo(NdotV, avgAlpha, safeColor0, safeColor90) * comp;
        float avgDirAlbedo = dot(dirAlbedo, vec3(1.0 / 3.0));
        bsdf.throughput = vec3(1.0 - avgDirAlbedo * weight);

        // Note: NdotL is cancelled out
        bsdf.response = D * F * G * comp * closureData.occlusion * weight / (4.0 * NdotV);
    }
    else if (closureData.closureType == CLOSURE_TYPE_TRANSMISSION)
    {
        vec3 comp = mx_ggx_energy_compensation(NdotV, avgAlpha, fd);
        vec3 dirAlbedo = mx_ggx_dir_albedo(NdotV, avgAlpha, safeColor0, safeColor90) * comp;
        float avgDirAlbedo = dot(dirAlbedo, vec3(1.0 / 3.0));
        bsdf.throughput = vec3(1.0 - avgDirAlbedo * weight);

        if (scatter_mode != 0)
        {
            float avgF0 = dot(safeColor0, vec3(1.0 / 3.0));
            fd.ior = vec3(mx_f0_to_ior(avgF0));
            bsdf.response = mx_surface_transmission(N, V, X, safeAlpha, distribution, fd, vec3(1.0)) * weight;
        }
    }
    else if (closureData.closureType == CLOSURE_TYPE_INDIRECT)
    {
        vec3 comp = mx_ggx_energy_compensation(NdotV, avgAlpha, fd);
        vec3 dirAlbedo = mx_ggx_dir_albedo(NdotV, avgAlpha, safeColor0, safeColor90) * comp;
        float avgDirAlbedo = dot(dirAlbedo, vec3(1.0 / 3.0));
        bsdf.throughput = vec3(1.0 - avgDirAlbedo * weight);

        vec3 Li = mx_environment_radiance(N, V, X, safeAlpha, distribution, fd);
        bsdf.response = Li * comp * weight;
    }
}


void mx_add_bsdf(ClosureData closureData, BSDF in1, BSDF in2, out BSDF result)
{
    result.response = in1.response + in2.response;

    // We derive the throughput for closure addition as follows:
    //   throughput_1 = 1 - dir_albedo_1
    //   throughput_2 = 1 - dir_albedo_2
    //   throughput_sum = 1 - (dir_albedo_1 + dir_albedo_2)
    //                  = 1 - ((1 - throughput_1) + (1 - throughput_2))
    //                  = throughput_1 + throughput_2 - 1
    result.throughput = max(in1.throughput + in2.throughput - 1.0, 0.0);
}


void mx_multiply_bsdf_float(ClosureData closureData, BSDF in1, float in2, out BSDF result)
{
    float weight = clamp(in2, 0.0, 1.0);
    result.response = in1.response * weight;
    result.throughput = in1.throughput;
}


void mx_layer_bsdf(ClosureData closureData, BSDF top, BSDF base, out BSDF result)
{
    result.response = top.response + base.response * top.throughput;
    result.throughput = top.throughput * base.throughput;
}

void IMPL_gltf_pbr_surfaceshader(vec3 base_color, float metallic, float roughness, vec3 normal, vec3 tangent, float occlusion, float transmission, float specular, vec3 specular_color, float ior, float alpha, int alpha_mode, float alpha_cutoff, float iridescence, float iridescence_ior, float iridescence_thickness, vec3 sheen_color, float sheen_roughness, float clearcoat, float clearcoat_roughness, vec3 clearcoat_normal, vec3 emissive, float emissive_strength, float thickness, float attenuation_distance, vec3 attenuation_color, float anisotropy_strength, float anisotropy_rotation, float dispersion, out surfaceshader out1)
{
    vec2 clearcoat_roughness_uv_out = vec2(0.0);
    mx_roughness_anisotropy(clearcoat_roughness, 0.000000, clearcoat_roughness_uv_out);
    float sheen_intensity_out = 0.0;
    NG_maxcomponent_color3(sheen_color, sheen_intensity_out);
    float sheen_roughness_sq_out = sheen_roughness * sheen_roughness;
    const float mix_iridescent_metal_bsdf_fg_weight_in1_tmp = 1.000000;
    float mix_iridescent_metal_bsdf_fg_weight_out = mix_iridescent_metal_bsdf_fg_weight_in1_tmp * iridescence;
    float alpha_roughness_out = roughness * roughness;
    float strength_2_out = anisotropy_strength * anisotropy_strength;
    float abs_anisotropy_rotation_out = abs(anisotropy_rotation);
    const float rad_2_deg_in2_tmp = -57.295780;
    float rad_2_deg_out = anisotropy_rotation * rad_2_deg_in2_tmp;
    const float mix_iridescent_metal_bsdf_mix_inv_amount_tmp = 1.000000;
    float mix_iridescent_metal_bsdf_mix_inv_out = mix_iridescent_metal_bsdf_mix_inv_amount_tmp - iridescence;
    const float mix_iridescent_dielectric_reflection_fg_weight_in1_tmp = 1.000000;
    float mix_iridescent_dielectric_reflection_fg_weight_out = mix_iridescent_dielectric_reflection_fg_weight_in1_tmp * iridescence;
    const float one_minus_ior_in1_tmp = 1.000000;
    float one_minus_ior_out = one_minus_ior_in1_tmp - ior;
    const float one_plus_ior_in1_tmp = 1.000000;
    float one_plus_ior_out = one_plus_ior_in1_tmp + ior;
    const vec3 dielectric_f90_in1_tmp = vec3(1.000000, 1.000000, 1.000000);
    vec3 dielectric_f90_out = dielectric_f90_in1_tmp * specular;
    const float mix_iridescent_dielectric_reflection_mix_inv_amount_tmp = 1.000000;
    float mix_iridescent_dielectric_reflection_mix_inv_out = mix_iridescent_dielectric_reflection_mix_inv_amount_tmp - iridescence;
    const float transmission_mix_fg_weight_in1_tmp = 1.000000;
    float transmission_mix_fg_weight_out = transmission_mix_fg_weight_in1_tmp * transmission;
    const float transmission_mix_mix_inv_amount_tmp = 1.000000;
    float transmission_mix_mix_inv_out = transmission_mix_mix_inv_amount_tmp - transmission;
    const float base_mix_mix_inv_amount_tmp = 1.000000;
    float base_mix_mix_inv_out = base_mix_mix_inv_amount_tmp - metallic;
    vec3 emission_color_out = emissive * emissive_strength;
    const float opacity_mask_cutoff_in1_tmp = 1.000000;
    const float opacity_mask_cutoff_in2_tmp = 0.000000;
    float opacity_mask_cutoff_out = (alpha >= alpha_cutoff) ? opacity_mask_cutoff_in1_tmp : opacity_mask_cutoff_in2_tmp;
    vec3 sheen_color_normalized_out = sheen_color / sheen_intensity_out;
    const float clamped_ab_low_tmp = 0.000010;
    const float clamped_ab_high_tmp = 1.000000;
    float clamped_ab_out = clamp(alpha_roughness_out, clamped_ab_low_tmp, clamped_ab_high_tmp);
    const float at_fg_tmp = 1.000000;
    float at_out = mix(alpha_roughness_out, at_fg_tmp, strength_2_out);
    vec3 rotate_tangent_out = vec3(0.0);
    mx_rotate_vector3(tangent, rad_2_deg_out, normal, rotate_tangent_out);
    const float mix_iridescent_metal_bsdf_bg_weight_in1_tmp = 1.000000;
    float mix_iridescent_metal_bsdf_bg_weight_out = mix_iridescent_metal_bsdf_bg_weight_in1_tmp * mix_iridescent_metal_bsdf_mix_inv_out;
    float ior_div_out = one_minus_ior_out / one_plus_ior_out;
    const float mix_iridescent_dielectric_reflection_bg_weight_in1_tmp = 1.000000;
    float mix_iridescent_dielectric_reflection_bg_weight_out = mix_iridescent_dielectric_reflection_bg_weight_in1_tmp * mix_iridescent_dielectric_reflection_mix_inv_out;
    const float transmission_mix_bg_weight_in1_tmp = 1.000000;
    float transmission_mix_bg_weight_out = transmission_mix_bg_weight_in1_tmp * transmission_mix_mix_inv_out;
    const int opacity_mask_value2_tmp = 1;
    float opacity_mask_out = (alpha_mode == opacity_mask_value2_tmp) ? opacity_mask_cutoff_out : alpha;
    const float clamped_at_low_tmp = 0.000010;
    const float clamped_at_high_tmp = 1.000000;
    float clamped_at_out = clamp(at_out, clamped_at_low_tmp, clamped_at_high_tmp);
    vec3 normalize_tangent_out = normalize(rotate_tangent_out);
    float dielectric_f0_from_ior_out = ior_div_out * ior_div_out;
    const int opacity_value2_tmp = 0;
    const float opacity_in1_tmp = 1.000000;
    float opacity_out = (alpha_mode == opacity_value2_tmp) ? opacity_in1_tmp : opacity_mask_out;
    vec2 roughness_uv_out = vec2(clamped_at_out,clamped_ab_out);
    const float selected_tangent_value2_tmp = 0.000000;
    vec3 selected_tangent_out = (abs_anisotropy_rotation_out > selected_tangent_value2_tmp) ? normalize_tangent_out : tangent;
    vec3 dielectric_f0_from_ior_specular_color_out = specular_color * dielectric_f0_from_ior_out;
    const float clamped_dielectric_f0_from_ior_specular_color_in2_tmp = 1.000000;
    vec3 clamped_dielectric_f0_from_ior_specular_color_out = min(dielectric_f0_from_ior_specular_color_out, clamped_dielectric_f0_from_ior_specular_color_in2_tmp);
    vec3 dielectric_f0_out = clamped_dielectric_f0_from_ior_specular_color_out * specular;
    surfaceshader shader_constructor_out = surfaceshader(vec3(0.0),vec3(0.0));
    {
        vec3 N = g_ptN;
        vec3 V = g_ptV;
        vec3 L = g_ptL;
        vec3 P = g_ptP;
        float occlusion = 1.0;

        ClosureData closureData = makeClosureData(g_ptClosureType, L, V, N, P, occlusion);
        BSDF clearcoat_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_dielectric_bsdf(closureData, clearcoat, vec3(1.000000, 1.000000, 1.000000), 1.500000, clearcoat_roughness_uv_out, false, 0.000000, 1.500000, clearcoat_normal, tangent, 0, 0, clearcoat_bsdf_out);
        BSDF sheen_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_sheen_bsdf(closureData, sheen_intensity_out, sheen_color_normalized_out, sheen_roughness_sq_out, normal, 0, sheen_bsdf_out);
        BSDF tf_metal_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_generalized_schlick_bsdf(closureData, mix_iridescent_metal_bsdf_fg_weight_out, base_color, vec3(1.000000, 1.000000, 1.000000), vec3(1.000000, 1.000000, 1.000000), 5.000000, roughness_uv_out, false, iridescence_thickness, iridescence_ior, normal, selected_tangent_out, 0, 0, tf_metal_bsdf_out);
        BSDF metal_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_generalized_schlick_bsdf(closureData, mix_iridescent_metal_bsdf_bg_weight_out, base_color, vec3(1.000000, 1.000000, 1.000000), vec3(1.000000, 1.000000, 1.000000), 5.000000, roughness_uv_out, false, 0.000000, 1.500000, normal, selected_tangent_out, 0, 0, metal_bsdf_out);
        BSDF mix_iridescent_metal_bsdf_add_out = BSDF(vec3(0.0),vec3(1.0));
        mx_add_bsdf(closureData, tf_metal_bsdf_out, metal_bsdf_out, mix_iridescent_metal_bsdf_add_out);
        BSDF base_mix_fg_mul_out = BSDF(vec3(0.0),vec3(1.0));
        mx_multiply_bsdf_float(closureData, mix_iridescent_metal_bsdf_add_out, metallic, base_mix_fg_mul_out);
        BSDF tf_reflection_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_generalized_schlick_bsdf(closureData, mix_iridescent_dielectric_reflection_fg_weight_out, dielectric_f0_out, vec3(1.000000, 1.000000, 1.000000), dielectric_f90_out, 5.000000, roughness_uv_out, false, iridescence_thickness, iridescence_ior, normal, selected_tangent_out, 0, 0, tf_reflection_bsdf_out);
        BSDF reflection_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_generalized_schlick_bsdf(closureData, mix_iridescent_dielectric_reflection_bg_weight_out, dielectric_f0_out, vec3(1.000000, 1.000000, 1.000000), dielectric_f90_out, 5.000000, roughness_uv_out, false, 0.000000, 1.500000, normal, selected_tangent_out, 0, 0, reflection_bsdf_out);
        BSDF mix_iridescent_dielectric_reflection_add_out = BSDF(vec3(0.0),vec3(1.0));
        mx_add_bsdf(closureData, tf_reflection_bsdf_out, reflection_bsdf_out, mix_iridescent_dielectric_reflection_add_out);
        BSDF transmission_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_dielectric_bsdf(closureData, transmission_mix_fg_weight_out, base_color, ior, roughness_uv_out, false, 0.000000, 1.500000, normal, selected_tangent_out, 0, 1, transmission_bsdf_out);
        BSDF diffuse_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_oren_nayar_diffuse_bsdf(closureData, transmission_mix_bg_weight_out, base_color, 0.000000, normal, false, diffuse_bsdf_out);
        BSDF transmission_mix_add_out = BSDF(vec3(0.0),vec3(1.0));
        mx_add_bsdf(closureData, transmission_bsdf_out, diffuse_bsdf_out, transmission_mix_add_out);
        BSDF iridescent_dielectric_bsdf_out = BSDF(vec3(0.0),vec3(1.0));
        mx_layer_bsdf(closureData, mix_iridescent_dielectric_reflection_add_out, transmission_mix_add_out, iridescent_dielectric_bsdf_out);
        BSDF base_mix_bg_mul_out = BSDF(vec3(0.0),vec3(1.0));
        mx_multiply_bsdf_float(closureData, iridescent_dielectric_bsdf_out, base_mix_mix_inv_out, base_mix_bg_mul_out);
        BSDF base_mix_add_out = BSDF(vec3(0.0),vec3(1.0));
        mx_add_bsdf(closureData, base_mix_fg_mul_out, base_mix_bg_mul_out, base_mix_add_out);
        BSDF sheen_layer_out = BSDF(vec3(0.0),vec3(1.0));
        mx_layer_bsdf(closureData, sheen_bsdf_out, base_mix_add_out, sheen_layer_out);
        BSDF clearcoat_layer_out = BSDF(vec3(0.0),vec3(1.0));
        mx_layer_bsdf(closureData, clearcoat_bsdf_out, sheen_layer_out, clearcoat_layer_out);
        shader_constructor_out.color += clearcoat_layer_out.response;

        {
            ClosureData closureData = makeClosureData(CLOSURE_TYPE_EMISSION, L, V, N, P, occlusion);
            EDF emission_out = EDF(0.0);
            mx_uniform_edf(closureData, emission_color_out, emission_out);
            shader_constructor_out.color += emission_out;
        }
    }

    out1 = shader_constructor_out;
}

void pt_InitMaterialSummary()
{
    pt_mMetal = metallic;
    pt_mSpecTrans = transmission;
    pt_mBaseColor = (base_color) * (1.0);
    pt_mSpecColor = specular_color;
    pt_mSpecWeight = specular;
    pt_mRough = roughness;
    pt_mTransExtraRough = 0.0;
    pt_mTransColor = vec3(1.0);
    pt_mThinWalled = false;
}

surfaceshader mtlxEvalSurface(State state)
{
    normalWorld = g_ptN;
    tangentWorld = g_ptTangent;
    vec3 geomprop_Nworld_out = normalize(normalWorld);
    vec3 geomprop_Tworld_out = normalize(tangentWorld);
    surfaceshader SR_glass_out = surfaceshader(vec3(0.0),vec3(0.0));
    IMPL_gltf_pbr_surfaceshader(base_color, metallic, roughness, geomprop_Nworld_out, geomprop_Tworld_out, occlusion, transmission, specular, specular_color, ior, alpha, alpha_mode, alpha_cutoff, iridescence, iridescence_ior, iridescence_thickness, sheen_color, sheen_roughness, clearcoat, clearcoat_roughness, geomprop_Nworld_out, emissive, emissive_strength, thickness, attenuation_distance, attenuation_color, anisotropy_strength, anisotropy_rotation, dispersion, SR_glass_out);
    return SR_glass_out;
}

float pt_RefractAlpha()
{
    float r = clamp(pt_mRough + pt_mTransExtraRough, 0.001, 1.0);
    return max(r * r, 1e-4);
}

vec3 pt_RefractBtdf(State state, vec3 Vl, vec3 Ll, out float pdfT)
{
    pdfT = 0.0;
    if (Ll.z >= 0.0) return vec3(0.0);
    float etaEff = pt_mThinWalled ? 1.0 : state.eta;
    float aT = pt_RefractAlpha();
    vec3 pt_Hraw = Vl + Ll * etaEff;
    // Degenerate half-vector (etaEff ~ 1, i.e. thin-walled straight transmission): no microfacet BTDF.
    if (dot(pt_Hraw, pt_Hraw) < 1e-6) return vec3(0.0);
    vec3 H = normalize(pt_Hraw);
    if (H.z < 0.0) H = -H;
    float LDotH = dot(Ll, H);
    float VDotH = dot(Vl, H);
    float D = GTR2(H.z, aT);
    float G1 = SmithG(abs(Vl.z), aT);
    float G2 = G1 * SmithG(abs(Ll.z), aT);
    float denom = LDotH + VDotH * etaEff;
    denom *= denom;
    float jacobian = abs(LDotH) / max(denom, 1e-7);
    float F = DielectricFresnel(abs(VDotH), etaEff);
    pdfT = G1 * max(0.0, VDotH) * D * jacobian / max(abs(Vl.z), 1e-4);
    vec3 tint = max(pt_mTransColor, vec3(0.0));
    return tint * (1.0 - F) * D * G2 * abs(VDotH) * jacobian * (etaEff * etaEff) / max(abs(Ll.z * Vl.z), 1e-5);
}

float pt_ClosurePdf(State state, vec3 V, vec3 N, vec3 L)
{
    vec3 pt_T;
    vec3 pt_B;
    Onb(N, pt_T, pt_B);
    vec3 pt_Vl = vec3(dot(V, pt_T), dot(V, pt_B), dot(V, N));
    vec3 pt_Ll = vec3(dot(L, pt_T), dot(L, pt_B), dot(L, N));
    float pt_NDotV = max(pt_Vl.z, 1e-4);
    float pt_metal = pt_mMetal;
    float pt_wTrans = pt_mSpecTrans * (1.0 - pt_metal);
    vec3 pt_F0 = mix(vec3(0.04) * max(pt_mSpecColor, vec3(0.0)) * pt_mSpecWeight, pt_mBaseColor, pt_metal);
    float pt_F0lum = max(pt_F0.x, max(pt_F0.y, pt_F0.z));
    float pt_Fv = pt_F0lum + (1.0 - pt_F0lum) * pow(1.0 - pt_NDotV, 5.0);
    float pt_diffLum = (1.0 - pt_metal) * (1.0 - pt_mSpecTrans) * dot(pt_mBaseColor, vec3(0.2126, 0.7152, 0.0722));
    float pt_pTrans = clamp(pt_wTrans * (1.0 - pt_Fv), 0.0, 0.9);
    float pt_pSpec = clamp(pt_Fv / (pt_Fv + (1.0 - pt_Fv) * pt_diffLum + 1e-3), 0.1, 0.9);
    if (pt_Ll.z < 0.0)
    {
        float pdfT;
        pt_RefractBtdf(state, pt_Vl, pt_Ll, pdfT);
        return max(pt_pTrans * pdfT, 1e-6);
    }
    float pt_rough = clamp(pt_mRough, 0.001, 1.0);
    float pt_a = max(pt_rough * pt_rough, 1e-4);
    vec3 pt_H = normalize(pt_Vl + pt_Ll);
    float pt_NDotH = clamp(pt_H.z, 0.0, 1.0);
    float pt_specPdf = SmithG(pt_NDotV, pt_a) * GTR2(pt_NDotH, pt_a) / (4.0 * pt_NDotV);
    float pt_diffPdf = max(pt_Ll.z, 1e-4) * INV_PI;
    return max((1.0 - pt_pTrans) * (pt_pSpec * pt_specPdf + (1.0 - pt_pSpec) * pt_diffPdf), 1e-6);
}

// Path tracer closure entry points (generated by PathTracerGlslShaderGenerator).

vec3 EvalMtlxClosure(int matID, State state, vec3 V, vec3 N, vec3 L, out float pdf, out int flags)
{
    pt_LoadParams(matID);
    pt_InitMaterialSummary();
    bool isReflect = dot(N, L) >= 0.0;
    flags = isReflect ? CLOSURE_FLAG_REFLECT : CLOSURE_FLAG_TRANSMIT;
    pdf = pt_ClosurePdf(state, V, N, L);
    // Transmission (T013): synthesized microfacet refraction BTDF (genglsl transmission is env-based, not path-traceable).
    if (!isReflect)
    {
        vec3 pt_T;
        vec3 pt_B;
        Onb(N, pt_T, pt_B);
        vec3 pt_Vl = vec3(dot(V, pt_T), dot(V, pt_B), dot(V, N));
        vec3 pt_Ll = vec3(dot(L, pt_T), dot(L, pt_B), dot(L, N));
        float pdfT;
        vec3 btdf = pt_RefractBtdf(state, pt_Vl, pt_Ll, pdfT);
        // Weight by the standard_surface transmission layer (specTrans * (1 - metal)) so opaque materials do not transmit.
        float pt_wTransL = pt_mSpecTrans * (1.0 - pt_mMetal);
        return btdf * abs(pt_Ll.z) * pt_wTransL;
    }
    g_ptV = V;
    g_ptN = N;
    g_ptL = L;
    g_ptP = state.fhp;
    g_ptTangent = state.tangent;
    g_ptBitangent = state.bitangent;
    g_ptTexcoord = state.texCoord;
    g_ptClosureType = CLOSURE_TYPE_REFLECTION;
    surfaceshader pt_surf = mtlxEvalSurface(state);
    return pt_surf.color;
}

vec3 SampleMtlxClosure(int matID, State state, vec3 V, vec3 N, out vec3 L, out float pdf, out int flags)
{
    pt_LoadParams(matID);
    pt_InitMaterialSummary();
    // T012/T013/T015: one-sample mixture (GGX specular reflection + cosine diffuse + rough dielectric transmission).
    vec3 pt_T;
    vec3 pt_B;
    Onb(N, pt_T, pt_B);
    vec3 pt_Vl = vec3(dot(V, pt_T), dot(V, pt_B), dot(V, N));
    if (pt_Vl.z < 0.0) pt_Vl = -pt_Vl;
    float pt_NDotV = max(pt_Vl.z, 1e-4);
    float pt_metal = pt_mMetal;
    float pt_wTrans = pt_mSpecTrans * (1.0 - pt_metal);
    vec3 pt_F0 = mix(vec3(0.04) * max(pt_mSpecColor, vec3(0.0)) * pt_mSpecWeight, pt_mBaseColor, pt_metal);
    float pt_F0lum = max(pt_F0.x, max(pt_F0.y, pt_F0.z));
    float pt_Fv = pt_F0lum + (1.0 - pt_F0lum) * pow(1.0 - pt_NDotV, 5.0);
    float pt_diffLum = (1.0 - pt_metal) * (1.0 - pt_mSpecTrans) * dot(pt_mBaseColor, vec3(0.2126, 0.7152, 0.0722));
    float pt_pTrans = clamp(pt_wTrans * (1.0 - pt_Fv), 0.0, 0.9);
    float pt_pSpec = clamp(pt_Fv / (pt_Fv + (1.0 - pt_Fv) * pt_diffLum + 1e-3), 0.1, 0.9);
    float pt_rough = clamp(pt_mRough, 0.001, 1.0);
    float pt_a = max(pt_rough * pt_rough, 1e-4);
    float pt_r1 = rand();
    float pt_r2 = rand();
    float pt_sel = rand();
    vec3 pt_Ll;
    if (pt_sel < pt_pTrans)
    {
        float aT = pt_RefractAlpha();
        vec3 pt_Hl = SampleGGXVNDF(pt_Vl, aT, aT, pt_r1, pt_r2);
        if (pt_Hl.z < 0.0) pt_Hl = -pt_Hl;
        float etaEff = pt_mThinWalled ? 1.0 : state.eta;
        pt_Ll = refract(-pt_Vl, pt_Hl, etaEff);
        if (dot(pt_Ll, pt_Ll) < 1e-8) pt_Ll = reflect(-pt_Vl, pt_Hl);
        pt_Ll = normalize(pt_Ll);
    }
    else if (pt_sel < pt_pTrans + (1.0 - pt_pTrans) * pt_pSpec)
    {
        vec3 pt_Hl = SampleGGXVNDF(pt_Vl, pt_a, pt_a, pt_r1, pt_r2);
        if (pt_Hl.z < 0.0) pt_Hl = -pt_Hl;
        pt_Ll = reflect(-pt_Vl, pt_Hl);
    }
    else
    {
        pt_Ll = CosineSampleHemisphere(pt_r1, pt_r2);
    }
    L = normalize(pt_T * pt_Ll.x + pt_B * pt_Ll.y + N * pt_Ll.z);
    bool isReflect = dot(N, L) >= 0.0;
    flags = isReflect ? CLOSURE_FLAG_REFLECT : CLOSURE_FLAG_TRANSMIT;
    pdf = pt_ClosurePdf(state, V, N, L);
    if (pdf <= 0.0)
    {
        pdf = 0.0;
        return vec3(0.0);
    }
    if (!isReflect)
    {
        vec3 pt_Vl2 = vec3(dot(V, pt_T), dot(V, pt_B), dot(V, N));
        vec3 pt_Ll2 = vec3(dot(L, pt_T), dot(L, pt_B), dot(L, N));
        float pdfT;
        vec3 btdf = pt_RefractBtdf(state, pt_Vl2, pt_Ll2, pdfT);
        float pt_wTransL = pt_mSpecTrans * (1.0 - pt_mMetal);
        return btdf * abs(pt_Ll2.z) * pt_wTransL;
    }
    g_ptV = V;
    g_ptN = N;
    g_ptL = L;
    g_ptP = state.fhp;
    g_ptTangent = state.tangent;
    g_ptBitangent = state.bitangent;
    g_ptTexcoord = state.texCoord;
    g_ptClosureType = CLOSURE_TYPE_REFLECTION;
    surfaceshader pt_surf = mtlxEvalSurface(state);
    return pt_surf.color;
}

vec3 EvalProceduralDisplacementLocal(int matId, vec2 uv, int texLayer) { return vec3(0.0); }

/*__PROCEDURAL_MATERIAL_GENERATED_END__*/
/*__PROCEDURAL_MATERIAL_INJECTION__*/

void GetMaterial(inout State state, in Ray r)
{
    int index = state.matID * MATERIALS_TEX_STRIDE;
    Material mat;
    Medium medium;

    vec4 param1 = texelFetch(materialsTex, ivec2(index + 0, 0), 0);
    vec4 param2 = texelFetch(materialsTex, ivec2(index + 1, 0), 0);
    vec4 param3 = texelFetch(materialsTex, ivec2(index + 2, 0), 0);
    vec4 param4 = texelFetch(materialsTex, ivec2(index + 3, 0), 0);
    vec4 param5 = texelFetch(materialsTex, ivec2(index + 4, 0), 0);
    vec4 param6 = texelFetch(materialsTex, ivec2(index + 5, 0), 0);
    vec4 param7 = texelFetch(materialsTex, ivec2(index + 6, 0), 0);
    vec4 param8 = texelFetch(materialsTex, ivec2(index + 7, 0), 0);

    mat.baseColor          = param1.rgb;
    mat.anisotropic        = param1.w;

    mat.emission           = param2.rgb;

    mat.metallic           = param3.x;
    mat.roughness          = max(param3.y, 0.001);
    mat.subsurface         = param3.z;
    mat.specularTint       = param3.w;

    mat.sheen              = param4.x;
    mat.sheenTint          = param4.y;
    mat.clearcoat          = param4.z;
    mat.clearcoatRoughness = mix(0.1, 0.001, param4.w); // Remapping from gloss to roughness

    mat.specTrans          = param5.x;
    mat.ior                = param5.y;
    mat.medium.type        = int(param5.z);
    mat.medium.density     = param5.w;

    mat.medium.color       = param6.rgb;
    mat.medium.anisotropy  = clamp(param6.w, -0.9, 0.9);

    ivec4 texIDs           = ivec4(param7);

    mat.opacity            = param8.x;
    mat.alphaMode          = int(param8.y);
    mat.alphaCutoff        = param8.z;
    mat.materialType       = int(param8.w + 0.5);

#ifndef OPT_RAYMARCHING

    // Base Color Map
    if (texIDs.x >= 0)
    {
        vec4 col = texture(textureMapsArrayTex, vec3(state.texCoord, texIDs.x));
        mat.baseColor.rgb *= pow(col.rgb, vec3(2.2));
        mat.opacity *= col.a;
    }

    // Metallic Roughness Map
    if (texIDs.y >= 0)
    {
        vec2 matRgh = texture(textureMapsArrayTex, vec3(state.texCoord, texIDs.y)).bg;
        mat.metallic = matRgh.x;
        mat.roughness = max(matRgh.y * matRgh.y, 0.001);
    }

    // Normal Map
    if (texIDs.z >= 0)
    {
        vec3 texNormal = texture(textureMapsArrayTex, vec3(state.texCoord, texIDs.z)).rgb;

#ifdef OPT_OPENGL_NORMALMAP
        texNormal.y = 1.0 - texNormal.y;
#endif
        texNormal = normalize(texNormal * 2.0 - 1.0);

        vec3 origNormal = state.normal;
        state.normal = normalize(state.tangent * texNormal.x + state.bitangent * texNormal.y + state.normal * texNormal.z);
        state.ffnormal = dot(origNormal, r.direction) <= 0.0 ? state.normal : -state.normal;
    }

    // Emission Map
    if (texIDs.w >= 0)
        mat.emission = pow(texture(textureMapsArrayTex, vec3(state.texCoord, texIDs.w)).rgb, vec3(2.2));

#endif

#ifdef OPT_ROUGHNESS_MOLLIFICATION
    if(state.depth > 0)
        mat.roughness = max(mix(0.0, state.mat.roughness, roughnessMollificationAmt), mat.roughness);
#endif

    float aspect = sqrt(1.0 - mat.anisotropic * 0.9);
    mat.ax = max(0.001, mat.roughness / aspect);
    mat.ay = max(0.001, mat.roughness * aspect);

    state.mat = mat;
    state.eta = dot(r.direction, state.normal) < 0.0 ? (1.0 / mat.ior) : mat.ior;
}

// TODO: Recheck all of this
#if defined(OPT_MEDIUM) && defined(OPT_VOL_MIS)
vec3 EvalTransmittance(Ray r)
{
    LightSampleRec lightSample;
    State state;
    vec3 transmittance = vec3(1.0);

    for (int depth = 0; depth < maxDepth; depth++)
    {
        bool hit = ClosestHit(r, state, lightSample);

        // If no hit (environment map) or if ray hit a light source then return transmittance
        if (!hit || state.isEmitter)
            break;

        // TODO: Get only parameters that are needed to calculate transmittance
        GetMaterial(state, r);

        bool alphatest = (state.mat.alphaMode == ALPHA_MODE_MASK && state.mat.opacity < state.mat.alphaCutoff) || (state.mat.alphaMode == ALPHA_MODE_BLEND && rand() > state.mat.opacity);
        bool refractive = (1.0 - state.mat.metallic) * state.mat.specTrans > 0.0;

        // Refraction is ignored (Not physically correct but helps with sampling lights from inside refractive objects)
        if(hit && !(alphatest || refractive))
            return vec3(0.0);

        // Evaluate transmittance
        if (dot(r.direction, state.normal) > 0. && state.mat.medium.type != MEDIUM_NONE)
        {
            vec3 color = state.mat.medium.type == MEDIUM_ABSORB ? vec3(1.0) - state.mat.medium.color : vec3(1.0);
            transmittance *= exp(-color * state.mat.medium.density * state.hitDist);
        }

        // Move ray origin to hit point
        r.origin = state.fhp + r.direction * EPS;
    }

    return transmittance;
}
#endif

vec3 DirectLight(in Ray r, in State state, bool isSurface)
{
    vec3 Ld = vec3(0.0);
    vec3 Li = vec3(0.0);
    vec3 scatterPos = state.fhp + state.normal * EPS;

    ScatterSampleRec scatterSample;

    // Environment Light
#ifdef OPT_ENVMAP
#ifndef OPT_UNIFORM_LIGHT
    {
        vec3 color;
        vec4 dirPdf = SampleEnvMap(Li);
        vec3 lightDir = dirPdf.xyz;
        float lightPdf = dirPdf.w;

        Ray shadowRay = Ray(scatterPos, lightDir);

#if defined(OPT_MEDIUM) && defined(OPT_VOL_MIS)
        // If there are volumes in the scene then evaluate transmittance rather than a binary anyhit test
        Li *= EvalTransmittance(shadowRay);

        if (isSurface)
        {
            int cflags;
            scatterSample.f = EvalClosureBridge(state, -r.direction, state.ffnormal, lightDir, scatterSample.pdf, cflags);
        }
        else
        {
            float p = PhaseHG(dot(-r.direction, lightDir), state.medium.anisotropy);
            scatterSample.f = vec3(p);
            scatterSample.pdf = p;
        }

        if (scatterSample.pdf > 0.0)
        {
            float misWeight = PowerHeuristic(lightPdf, scatterSample.pdf);
            if (misWeight > 0.0)
                Ld += misWeight * Li * scatterSample.f * envMapIntensity / lightPdf;
        }
#else
        // If there are no volumes in the scene then use a simple binary hit test
        bool inShadow = AnyHit(shadowRay, INF - EPS);
        
        if (!inShadow)
        {
            int cflags;
            scatterSample.f = EvalClosureBridge(state, -r.direction, state.ffnormal, lightDir, scatterSample.pdf, cflags);

            if (scatterSample.pdf > 0.0)
            {
                float misWeight = PowerHeuristic(lightPdf, scatterSample.pdf);
                if (misWeight > 0.0)
                    Ld += misWeight * Li * scatterSample.f * envMapIntensity / lightPdf;
            }
        }
#endif
    }
#endif
#endif

    // Analytic Lights
#ifdef OPT_LIGHTS
    {
        LightSampleRec lightSample;
        Light light;

        //Pick a light to sample
        int index = int(rand() * float(numOfLights)) * 5;

        // Fetch light Data
        vec3 position = texelFetch(lightsTex, ivec2(index + 0, 0), 0).xyz;
        vec3 emission = texelFetch(lightsTex, ivec2(index + 1, 0), 0).xyz;
        vec3 u        = texelFetch(lightsTex, ivec2(index + 2, 0), 0).xyz; // u vector for rect
        vec3 v        = texelFetch(lightsTex, ivec2(index + 3, 0), 0).xyz; // v vector for rect
        vec3 params   = texelFetch(lightsTex, ivec2(index + 4, 0), 0).xyz;
        float radius  = params.x;
        float area    = params.y;
        float type    = params.z; // 0->Rect, 1->Sphere, 2->Distant

        light = Light(position, emission, u, v, radius, area, type);

        SampleOneLight(light, scatterPos, lightSample);
        Li = lightSample.emission;

        if (dot(lightSample.direction, lightSample.normal) < 0.0) // Required for quad lights with single sided emission
        {
            Ray shadowRay = Ray(scatterPos, lightSample.direction);

            // If there are volumes in the scene then evaluate transmittance rather than a binary anyhit test
#if defined(OPT_MEDIUM) && defined(OPT_VOL_MIS)
            Li *= EvalTransmittance(shadowRay);

            if (isSurface)
            {
                int cflags;
                scatterSample.f = EvalClosureBridge(state, -r.direction, state.ffnormal, lightSample.direction, scatterSample.pdf, cflags);
            }
            else
            {
                float p = PhaseHG(dot(-r.direction, lightSample.direction), state.medium.anisotropy);
                scatterSample.f = vec3(p);
                scatterSample.pdf = p;
            }

            float misWeight = 1.0;
            if(light.area > 0.0) // No MIS for distant light
                misWeight = PowerHeuristic(lightSample.pdf, scatterSample.pdf);

            if (scatterSample.pdf > 0.0)
                Ld += misWeight * scatterSample.f * Li / lightSample.pdf;
#else
            // If there are no volumes in the scene then use a simple binary hit test
            bool inShadow = AnyHit(shadowRay, lightSample.dist - EPS);

            if (!inShadow)
            {
                int cflags;
                scatterSample.f = EvalClosureBridge(state, -r.direction, state.ffnormal, lightSample.direction, scatterSample.pdf, cflags);

                float misWeight = 1.0;
                if(light.area > 0.0) // No MIS for distant light
                    misWeight = PowerHeuristic(lightSample.pdf, scatterSample.pdf);

                if (scatterSample.pdf > 0.0)
                    Ld += misWeight * Li * scatterSample.f / lightSample.pdf;
            }
#endif
        }
    }
#endif

    return Ld;
}

vec4 PathTrace(Ray r)
{
    vec3 radiance = vec3(0.0);
    vec3 throughput = vec3(1.0);
    State state;
    LightSampleRec lightSample;
    ScatterSampleRec scatterSample;

    // FIXME: alpha from material opacity/medium density
    float alpha = 1.0;

    // For medium tracking
    bool inMedium = false;
    bool mediumSampled = false;
    bool surfaceScatter = false;

    for (state.depth = 0;; state.depth++)
    {
        bool hit = ClosestHit(r, state, lightSample);

        if (!hit)
        {
#if defined(OPT_BACKGROUND) || defined(OPT_TRANSPARENT_BACKGROUND)
            if (state.depth == 0)
                alpha = 0.0;
#endif

#ifdef OPT_HIDE_EMITTERS
            if(state.depth > 0)
#endif
            {
#ifdef OPT_UNIFORM_LIGHT
                radiance += uniformLightCol * throughput;
#else
#ifdef OPT_ENVMAP
                vec4 envMapColPdf = EvalEnvMap(r);

                float misWeight = 1.0;

                // Gather radiance from envmap and use scatterSample.pdf from previous bounce for MIS
                if (state.depth > 0)
                    misWeight = PowerHeuristic(scatterSample.pdf, envMapColPdf.w);

#if defined(OPT_MEDIUM) && !defined(OPT_VOL_MIS)
                if(!surfaceScatter)
                    misWeight = 1.0f;
#endif

                if(misWeight > 0.)
                    radiance += misWeight * envMapColPdf.rgb * throughput * envMapIntensity;
#endif
#endif
             }
             break;
        }

        GetMaterial(state, r);

        // Gather radiance from emissive objects. Emission from meshes is not importance sampled
        radiance += state.mat.emission * throughput;
        
#ifdef OPT_LIGHTS

        // Gather radiance from light and use scatterSample.pdf from previous bounce for MIS
        if (state.isEmitter)
        {
            float misWeight = 1.0;

            if (state.depth > 0)
                misWeight = PowerHeuristic(scatterSample.pdf, lightSample.pdf);

#if defined(OPT_MEDIUM) && !defined(OPT_VOL_MIS)
            if(!surfaceScatter)
                misWeight = 1.0f;
#endif

            radiance += misWeight * lightSample.emission * throughput;

            break;
        }
#endif
        // Stop tracing ray if maximum depth was reached
        if(state.depth == maxDepth)
            break;

#ifdef OPT_MEDIUM

        mediumSampled = false;
        surfaceScatter = false;

        // Handle absorption/emission/scattering from medium
        // TODO: Handle light sources placed inside medium
        if(inMedium)
        {
            if(state.medium.type == MEDIUM_ABSORB)
            {
                throughput *= exp(-(1.0 - state.medium.color) * state.hitDist * state.medium.density);
            }
            else if(state.medium.type == MEDIUM_EMISSIVE)
            {
                radiance += state.medium.color * state.hitDist * state.medium.density * throughput;
            }
            else
            {
                // Sample a distance in the medium
                float scatterDist = min(-log(rand()) / state.medium.density, state.hitDist);
                mediumSampled = scatterDist < state.hitDist;

                if (mediumSampled)
                {
                    throughput *= state.medium.color;

                    // Move ray origin to scattering position
                    r.origin += r.direction * scatterDist;
                    state.fhp = r.origin;

                    // Transmittance Evaluation
                    radiance += DirectLight(r, state, false) * throughput;

                    // Pick a new direction based on the phase function
                    vec3 scatterDir = SampleHG(-r.direction, state.medium.anisotropy, rand(), rand());
                    scatterSample.pdf = PhaseHG(dot(-r.direction, scatterDir), state.medium.anisotropy);
                    r.direction = scatterDir;
                }
            }
        }

        // If medium was not sampled then proceed with surface BSDF evaluation
        if (!mediumSampled)
        {
#endif
#ifdef OPT_ALPHA_TEST

            // Ignore intersection and continue ray based on alpha test
            if ((state.mat.alphaMode == ALPHA_MODE_MASK && state.mat.opacity < state.mat.alphaCutoff) ||
                (state.mat.alphaMode == ALPHA_MODE_BLEND && rand() > state.mat.opacity))
            {
                scatterSample.L = r.direction;
                state.depth--;
            }
            else
#endif
            {
                surfaceScatter = true;

                // Next event estimation
                radiance += DirectLight(r, state, true) * throughput;

                // Sample BSDF for color and outgoing direction
                int cflags;
                scatterSample.f = SampleClosureBridge(state, -r.direction, state.ffnormal, scatterSample.L, scatterSample.pdf, cflags);
                if (scatterSample.pdf > 0.0)
                    throughput *= scatterSample.f / scatterSample.pdf;
                else
                    break;
            }

            // Move ray origin to hit point and set direction for next bounce
            r.direction = scatterSample.L;
            r.origin = state.fhp + r.direction * EPS;

#ifdef OPT_MEDIUM

            // Note: Nesting of volumes isn't supported due to lack of a volume stack for performance reasons
            // Ray is in medium only if it is entering a surface containing a medium
            if (dot(r.direction, state.normal) < 0. && state.mat.medium.type != MEDIUM_NONE)
            {
                inMedium = true;
                // Get medium params from the intersected object
                state.medium = state.mat.medium;
            }
            // FIXME: Objects clipping or inside a medium were shaded incorrectly as inMedium would be set to false.
            // This hack works for now but needs some rethinking
            else if(state.mat.medium.type != MEDIUM_NONE)
                inMedium = false;
        }
#endif

#ifdef OPT_RR
        // Russian roulette
        if (state.depth >= OPT_RR_DEPTH)
        {
            float q = min(max(throughput.x, max(throughput.y, throughput.z)) + 0.001, 0.95);
            if (rand() > q)
                break;
            throughput /= q;
        }
#endif

    }

    return vec4(radiance, alpha);
}

void main(void)
{
    vec2 coordsTile = mix(tileOffset, tileOffset + invNumTiles, TexCoords);

    InitRNG(gl_FragCoord.xy, frameNum);

    float r1 = 2.0 * rand();
    float r2 = 2.0 * rand();

    vec2 jitter;
    jitter.x = r1 < 1.0 ? sqrt(r1) - 1.0 : 1.0 - sqrt(2.0 - r1);
    jitter.y = r2 < 1.0 ? sqrt(r2) - 1.0 : 1.0 - sqrt(2.0 - r2);

    jitter /= (resolution * 0.5);
    vec2 d = (coordsTile * 2.0 - 1.0) + jitter;

    float scale = tan(camera.fov * 0.5);
    d.y *= resolution.y / resolution.x * scale;
    d.x *= scale;
    vec3 rayDir = normalize(d.x * camera.right + d.y * camera.up + camera.forward);

    vec3 focalPoint = camera.focalDist * rayDir;
    float cam_r1 = rand() * TWO_PI;
    float cam_r2 = rand() * camera.aperture;
    vec3 randomAperturePos = (cos(cam_r1) * camera.right + sin(cam_r1) * camera.up) * sqrt(cam_r2);
    vec3 finalRayDir = normalize(focalPoint - randomAperturePos);

    Ray ray = Ray(camera.position + randomAperturePos, finalRayDir);

    vec4 accumColor = texture(accumTexture, coordsTile);

    vec4 pixelColor = PathTrace(ray);

    color = pixelColor + accumColor;
}
