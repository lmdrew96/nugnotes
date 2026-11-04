/**
 * Shrink a page photo before upload. A phone shot is 3–5 MB at 12 MP; at 2400px
 * on the long edge, handwriting stays sharp (Claude's vision works below that
 * anyway) and the file is a few hundred KB, so a page uploads in a second or two
 * on cellular. Always JPEG, which also turns HEIC into something every browser
 * and the API can read.
 */
const MAX_EDGE = 2400;
const QUALITY = 0.85;

export const preparePhoto = async (file: File): Promise<File> => {
  // from-image applies the camera's EXIF rotation, so pages aren't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('This browser could not process the photo.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not compress the photo.'))),
      'image/jpeg',
      QUALITY,
    );
  });
  return new File([blob], 'page.jpg', { type: 'image/jpeg' });
};
