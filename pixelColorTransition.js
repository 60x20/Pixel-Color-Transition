'use strict'

const outputCanvas = document.getElementById('transition-output');
const outputCanvasContext = outputCanvas.getContext('2d');

const renderButton = document.querySelector('#render-transition');

const imageForm = document.getElementById('image-input-form');

// 60 used by default, also obtained through user input
let hertz = 60;
let frameDurationMs = calculateFrameDurationMs(hertz);
function calculateFrameDurationMs(hertz) {
  return 1000 / hertz;
}

let transitionDurationMs = 1000;

const imageInTheBeginningRegex = /^image/;

// extract image files into the imageFiles array
imageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const imageFiles = [];

  const formData = new FormData(e.currentTarget);
  
  for (const [name, input] of formData) {
    // if it's not an image file (type === image/*) ignore it
    if (imageInTheBeginningRegex.test(input.type)) {
      imageFiles.push(input);
    } else if (name === 'duration') {
      transitionDurationMs = Number(input) * 1000;
    } else if (name === 'hertz') {
      hertz = Number(input);
      frameDurationMs = calculateFrameDurationMs(hertz);
    }
  }

  prepareTransition(imageFiles);
})

async function prepareTransition(imageFiles) {
  renderButton.removeEventListener('click', renderTransition);
  renderButton.classList.remove('display-none');
  renderButton.innerText = 'loading';

  // since order is important, awaits are used;
  // image objects are used to get the dimensions, and will also be rendered onto the canvas
  const imageObjects = await convertImageFilesIntoImageObjects(imageFiles);
  equalizeImageObjectResolutions(imageObjects);
  transitionImageObjects = createTransitionImageObjectCouples(imageObjects);
  
  renderButton.innerText = 'play';
  renderButton.addEventListener('click', renderTransition);
}

async function convertImageFilesIntoImageObjects(imageFilesArr) {
  const imageObjects = [];

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

  return imageObjects;
}

function equalizeImageObjectResolutions(imageObjects) {
  // in order to equalize dimensions, get the biggest dimensions, and use them
  let biggestW = 1;
  let biggestH = 1;
  for (const {naturalWidth, naturalHeight} of imageObjects) {
    if (naturalWidth > biggestW) biggestW = naturalWidth;
    if (naturalHeight > biggestH) biggestH = naturalHeight;
  }

  for (const imageObject of imageObjects) {
    imageObject.width = biggestW;
    imageObject.height = biggestH;
  }
}

// using transparency
function createTransitionImageObjectCouples(imageObjects) {
  // if length is 1, duplicate that image, allowing a transition
  if (imageObjects.length === 1) imageObjects.push(imageObjects[0]);

  const transitionAmount = imageObjects.length - 1;
  // minimum 1, otherwise some will be skipped
  const framesPerTransition = Math.round(transitionDurationMs / frameDurationMs / transitionAmount) || 1;
  // transparencies will change proportionately to this percentage
  const changeInTransparency = 1 / framesPerTransition;

  const transitionImageObjects = {
    initialFrame: imageObjects[0],
    allTransitionCouples: []
  }

  // in order for the transitions to be smooth, the first frames should not be the original images
  // instead they should be gradually changed versions of them
  // select the first couple, then the second couple..., then the last couple ([0, 1], [1, 2], ..., [last - 1, last])
  const lastImageObjectIndex = imageObjects.length - 1;
  // create transition frames for each couple
  for (let i = 0; i < lastImageObjectIndex; i++) {
    const
      imageObjectFrom = imageObjects[i],
      imageObjectTo = imageObjects[i + 1]
    ;

    const transitionCouples = [];

    let changeTimes = 0;
    for (let n = 0; n < framesPerTransition; n++) {
      changeTimes++;
      
      const transparencyImageTo = changeInTransparency * changeTimes;
      const transparencyImageFrom = 1 - transparencyImageTo;
      
      const transitionCouple = [
        { image: imageObjectFrom, transparency: transparencyImageFrom },
        { image: imageObjectTo, transparency: transparencyImageTo }
      ];

      transitionCouples.push(transitionCouple);
    }

    transitionImageObjects.allTransitionCouples.push(...transitionCouples);
  }
  
  return transitionImageObjects;
}

// transitionImageObjects is global because render transition is used as an event handler
let transitionImageObjects = {};
function renderTransition() {
  // for calculating transition duration
  const start = performance.now();

  const { initialFrame, allTransitionCouples } = transitionImageObjects;
  // {
  //   initialFrame: img,
  //   allTransitionCouples: [
  //     [
  //       { image: imgFrom, transparency: 0.5},
  //       { image: imgTo, transparency: 0.5}
  //     ]
  //   ]
  // }

  // they have the same width and height
  const
    dimensionW = initialFrame.width,
    dimensionH = initialFrame.height
  ;

  outputCanvas.width = dimensionW;
  outputCanvas.height = dimensionH;
  
  outputCanvasContext.drawImage(initialFrame, 0, 0, dimensionW, dimensionH);

  const totalFrames = allTransitionCouples.length;
  let frameIndex = 0; 
  
  requestAnimationFrame(
    requestAnimationFrameInterval
  );

  function requestAnimationFrameInterval() {
    renderTransitionCouple(allTransitionCouples[frameIndex++]);

    if (frameIndex < totalFrames) {
      requestAnimationFrame(requestAnimationFrameInterval);
    } else {
      const end = performance.now();
      console.log(`transition took ${end - start}`);
    }
  }

  function renderTransitionCouple(transitionCouple) {
    const [ imageFrom, imageTo ] = transitionCouple;
    
    outputCanvasContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    // render imageFrom
    outputCanvasContext.globalAlpha = imageFrom.transparency;
    outputCanvasContext.drawImage(imageFrom.image, 0, 0, dimensionW, dimensionH);
    // render imageTo
    outputCanvasContext.globalAlpha = imageTo.transparency;
    outputCanvasContext.drawImage(imageTo.image, 0, 0, dimensionW, dimensionH);
  }
}