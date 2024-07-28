'use strict'

// TODO: instead of adding blank pixels to equalize resolution, zoom in or out
// zoom in or out/add blank spaces to make resolutions the same

// get images using File API
// pixel manipulation using Canvas API

// function computeFrame(canvasContext) {
//   canvasContext.drawImage(video, 0, 0, 450, 300);
// }

// function computeFrameMultipleTimes(canvasContext) {
//   computeFrame(canvasContext);
//   requestAnimationFrame(computeFrameMultipleTimes);
// }

const outputCanvas = document.getElementById('transition-output');
const outputCanvasContext = outputCanvas.getContext('2d');

const renderButton = document.querySelector('#render-transition');

// dummy canvas for creating image data (not inserted into document at all)
const dummyCanvas = document.createElement('canvas');
// canvas has big dimensions because otherwise big images will be displayed partially
const dummyCanvasMaxLength = 10000;
dummyCanvas.width = dummyCanvasMaxLength;
dummyCanvas.height = dummyCanvasMaxLength;
const dummyContext = dummyCanvas.getContext('2d', { willReadFrequently: true });

const imageForm = document.getElementById('image-input-form');
let transitionDurationMs = 1000;
let imageFiles = [];
// image objects are used to get the dimensions
let imageObjects = [];
// imageDatas will be used to manipulate the pixels
let imageDatas = [];
let transitionImageDatas;
const imageInTheBeginningRegex = /^image/;
// extract image files into the imageFiles array
imageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // reset the array, otherwise it will get polluted
  imageFiles = [];

  const formData = new FormData(e.currentTarget);
  
  for (const [name, input] of formData) {
    // if it's not an image file (type === image/*) ignore it
    if (imageInTheBeginningRegex.test(input.type)) {
      imageFiles.push(input);
    } else if (name === 'duration') {
      transitionDurationMs = Number(input) * 1000;
    }
  }

  prepareTransition();
})

async function prepareTransition() {
  renderButton.removeEventListener('click', renderTransition);
  renderButton.classList.remove('display-none');
  renderButton.innerText = 'loading';

  // since order is important, awaits are used;
  await convertImageFilesIntoImageObjects(imageFiles);
  convertImageFilesIntoImageDatas(imageObjects);
  createTransitionImageDatas(imageDatas);
  
  renderButton.innerText = 'play';
  renderButton.addEventListener('click', renderTransition);
}

async function convertImageFilesIntoImageObjects(imageFilesArr) {
  // reset so that it is not polluted
  imageObjects = [];

  // image objects are created to get the dimensions
  for (const imageFile of imageFilesArr) {
    const fileAsDataURL = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(imageFile);
      reader.addEventListener('load', () => {
        resolve(reader.result);
      });
    });
    const imageObj = new Image();
    imageObj.src = fileAsDataURL;
    // since loading the data into the image obj takes some time, we need to use load events, otherwise width and height are '0'
    await new Promise((resolve) => {
      imageObj.addEventListener('load', resolve);
    });
    imageObjects.push(imageObj);
  }
}

function convertImageFilesIntoImageDatas(imageObjects) {
  // reset so that it is not polluted
  imageDatas = [];

  for (const imageObject of imageObjects) {
    dummyContext.clearRect(0, 0, dummyCanvas.width, dummyCanvas.height);
    dummyContext.drawImage(imageObject, 0, 0);
    const dummyImageData = dummyContext.getImageData(0, 0, imageObject.width, imageObject.height);
    imageDatas.push(dummyImageData);
  }
}

// TODO: might be obtained through user input
const hertz = 60;
// duration of 1 frame === 16.6ms
const frameDurationMs = 1000 / hertz;
function createTransitionImageDatas(imageDatasArr) {
  // if length is 1, duplicate that image, allowing a transition
  if (imageDatasArr.length === 1) imageDatasArr.push(imageDatasArr[0]);

  const transitionAmount = imageDatasArr.length - 1;
  // minimum 1, otherwise some will be skipped
  const framesPerTransition = Math.round(transitionDurationMs / frameDurationMs / transitionAmount) || 1;
  const totalFrames = framesPerTransition * transitionAmount;

  transitionImageDatas = {
    initialFrame: imageDatasArr[0],
    allTransitionFrames: []
  }
  
  // in order for the transitions to be smooth, the first frames should not be the original images
  // instead they should be changed versions of them
  // select the first couple, then the second couple..., then the last couple ([0, 1], [1, 2], ..., [last - 1, last])
  const lastImageDataIndex = imageDatasArr.length - 1;
  // create transition frames for each couple
  for (let i = 0; i < lastImageDataIndex; i++) {
    const
      resolutionW = imageDatasArr[i].width,
      resolutionH = imageDatasArr[i].height,
      imageDataFrom = imageDatasArr[i].data,
      imageDataTo = imageDatasArr[i + 1].data
    ;

    const transitionFrames = [];
    // resolutions must be the same
    const pixelDataLength = imageDataFrom.length;
    for (let n = 0; n < framesPerTransition; n++) {
      const emptyPixelData = new Uint8ClampedArray(pixelDataLength);
      transitionFrames.push(new ImageData(emptyPixelData, resolutionW, resolutionH));
    }

    // increase by 4 to get to the next pixel
    for (let subpixel = 0; subpixel < pixelDataLength; subpixel += 4) {
      const 
        fromR = imageDataFrom[subpixel],
        fromG = imageDataFrom[subpixel + 1],
        fromB = imageDataFrom[subpixel + 2],
        fromA = imageDataFrom[subpixel + 3]
      ;
      const 
        toR = imageDataTo[subpixel],
        toG = imageDataTo[subpixel + 1],
        toB = imageDataTo[subpixel + 2],
        toA = imageDataTo[subpixel + 3]
      ;

      const 
        changeR = (toR - fromR) / framesPerTransition,
        changeG = (toG - fromG) / framesPerTransition,
        changeB = (toB - fromB) / framesPerTransition,
        changeA = (toA - fromA) / framesPerTransition
      ;

      // apply pixel values
      let changeTimes = 0;
      for (const {data: pixelData} of transitionFrames) {
        changeTimes++;

        pixelData[subpixel] = fromR + changeR * changeTimes;
        pixelData[subpixel + 1] = fromG + changeG * changeTimes;
        pixelData[subpixel + 2] = fromB + changeB * changeTimes;
        pixelData[subpixel + 3] = fromA + changeA * changeTimes;
      }
    }

    transitionImageDatas.allTransitionFrames.push(...transitionFrames);
  }
}

function renderTransition() {
  const { initialFrame, allTransitionFrames } = transitionImageDatas;

  outputCanvas.width = initialFrame.width;
  outputCanvas.height = initialFrame.height;
  
  outputCanvasContext.putImageData(initialFrame, 0, 0);

  const frameLength = allTransitionFrames.length;
  let frameCounter = 0;
  let frameIndex = 0; 

  function requestAnimationFrameInterval() {
    frameCounter++;

    outputCanvasContext.putImageData(allTransitionFrames[frameIndex++], 0, 0);

    if (frameCounter === frameLength) {
      console.log('finished');
    } else {
      requestAnimationFrame(requestAnimationFrameInterval);
    }
  }

  requestAnimationFrame(
    requestAnimationFrameInterval
  );
}