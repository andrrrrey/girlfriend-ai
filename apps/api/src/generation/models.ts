/**
 * @file models.ts
 * @description Модели генерации изображений и видео (общие для GenerationService
 * и серверной сборки спецификации генерации).
 */

export const IMAGE_MODELS = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
  { id: "alibaba/wan-2.6/text-to-image", name: "Wan 2.6 (NSFW)", description: "Uncensored image generation", provider: "atlascloud" },
  { id: "civitai", name: "Civitai RED", description: "Civitai Orchestration API", provider: "civitai" },
];

export const VIDEO_MODELS = [
  { id: "atlascloud/van-2.6/text-to-video", name: "Van 2.6 (NSFW)", description: "Text-to-video, uncensored", provider: "atlascloud" },
  { id: "atlascloud/wan-2.6-spicy/image-to-video", name: "Wan 2.6 Spicy (I2V)", description: "Image-to-video, uncensored", provider: "atlascloud" },
  { id: "alibaba/wan-2.7/image-to-video", name: "Wan 2.7 (Continue)", description: "Continue / extend existing video", provider: "atlascloud" },
];

/** Дефолтные модели видео по режиму генерации. */
export const VIDEO_MODE_DEFAULT_MODEL: Record<string, string> = {
  img2vid: "atlascloud/wan-2.6-spicy/image-to-video",
  continue: "alibaba/wan-2.7/image-to-video",
};
