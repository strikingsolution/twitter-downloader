#!/usr/bin/env node

let puppeteer = require("puppeteer");
const fs = require('fs');
const { program } = require('commander');
const path = require('path');
const os = require('os');
const axios = require('axios');
const AsyncRetry = require("async-retry");
const { setTimeout } = require("timers/promises");

const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

//initialize CMD arg structure
program
  .argument("<source>", "the URL to the tweet or the ID of the tweet.")
  .option("-v --verbose", "output extra information", false)
  .option("-s --silent", "removes all stdout output, overriding other flags", false)
  .option("-h --with-head", "run xvidrip with a head", false)
  .argument("[destination]", "the path and filename of the output file")
  .parse(process.argv);

let programArgs = program.args;
let programOptions = program.opts();

function verbose_print(strToPrint) {
  if (programOptions.silent) return;
  if (programOptions.verbose) {
    console.log(strToPrint);
  }
}

function print(strToPrint) {
  if (programOptions.silent) return;
  console.log(strToPrint);
}

let sourceInput = programArgs[0];
let userDestination = programArgs[1];

// let tweetId = sourceInput.match(/\d+$/);

// verbose_print(`Tweet ID is: ${tweetId}`);

// let embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`;

// (async () => {
//   let fetchResponse;
//   await AsyncRetry(async (bail) => {
//     fetchResponse = await getTweetResult();
//   }, { retries: 5, onRetry: () => { print("Retrying...") } });

//   print("Converting tweet result to JSON...");
//   let body = await fetchResponse.data;

//   if (body.video) {
//     let videoVariantArray = body.video.variants;
//     let mp4Url = identifyBestVariant(videoVariantArray);
//     let mp4AsBuffer = await downloadMedia(mp4Url);
//     let videoDestination = resolveDownloadPath(userDestination, '.mp4');
//     saveMediaToFile(mp4AsBuffer, videoDestination);
//     print(`Downloaded video to ${videoDestination}`);
//   } else {
//     print("No video found in the tweet.");
//   }

//   console.log("Body: ", body);

//   if (body.photos) {
//     let photoArray = body.photos;
//     for (let i = 0; i < photoArray.length; i++) {
//       let photoUrl = photoArray[i].url;
//       let photoAsBuffer = await downloadMedia(photoUrl);
//       let photoDestination = resolveDownloadPath(userDestination, `_photo${i + 1}.jpg`);
//       saveMediaToFile(photoAsBuffer, photoDestination);
//       print(`Downloaded photo ${i + 1} to ${photoDestination}`);
//     }
//   } else {
//     print("No photos found in the tweet.");
//   }
// })();

// Puppeteer function to get tweet result
async function getTweetResult(embedUrl) {
  print("Opening puppeteer...");
  const browser = await puppeteer.launch({ headless: !programOptions.withHead });
  const page = await browser.newPage();
  let tweetResult;

  await page.setRequestInterception(true);
  page.on("request", (interceptedRequest) => {
    if (interceptedRequest.url().includes("https://cdn.syndication.twimg.com/tweet-result")) {
      tweetResult = axios.get(interceptedRequest.url());
    }
    interceptedRequest.continue();
  });
  console.log(embedUrl)
  await page.goto(embedUrl);

  while (!tweetResult) {
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for tweet result
  }

  await browser.close();
  return tweetResult;
}

// Function to identify the best video variant
function identifyBestVariant(variantArray) {
  verbose_print("Identifying best video variant...");
  let filteredVariantArray = variantArray.filter(variant => {return variant.type === "video/mp4"});
  if (filteredVariantArray.length > 0) {
    return filteredVariantArray[0].src;
  } else {
    throw new Error("No video variant found.");
  }
}

// Function to resolve download path for media files
function resolveDownloadPath(userDestination, extension) {
  print("Resolving download path...");
  let fileName = userDestination || "media";
  let extName = extension || ".mp4";
  return path.resolve(fileName + extName);
}

// Function to download media
async function downloadMedia(url) {
  print(`Downloading media from '${url}'...`);
  let response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

// Function to save media to file
function saveMediaToFile(buffer, filePath) {
  fs.writeFileSync(filePath, buffer);
}

app.use(express.json());

let isVideo

app.post('/downloadTweetMedia', async (req, res) => {
  const { tweetId } = req.body;

  try {
    const mediaFiles = await downloadTweetMedia(tweetId);
    res.json({ success: true, isVideo, mediaFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


async function downloadTweetMedia(tweetId) {
  embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`;

  let fetchResponse;
  await AsyncRetry(async (bail) => {
    fetchResponse = await getTweetResult(embedUrl);
  }, { retries: 5 });

  const body = await fetchResponse.data;
  const data = [];

  console.log(body)

if (body.video) {
  isVideo = true;
  let videoVariantArray = body.video.variants;
  let mp4Url = identifyBestVariant(videoVariantArray);
  data.push({ url: mp4Url });
} else {
  print("No video found in the tweet.");
}

if (body.photos) {
  let photoArray = body.photos;
  for (let i = 0; i < photoArray.length; i++) {
    isVideo = false;
    let photoUrl = photoArray[i].url;
    data.push({ url: photoUrl });
  }
} else {
  print("No photos found in the tweet.");
}

  return data;
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});