/**
 * Runs the explicit-image classifier on its own thread.
 *
 * TensorFlow.js without native bindings computes on the JavaScript thread,
 * and a classification takes over a second. On the API's main thread that
 * would stall every other request for that second, so the model lives here
 * and the main thread only sends pixels and waits for a message.
 *
 * Input: 224x224 RGB pixels. Output: the five class probabilities.
 */
import { parentPort } from 'node:worker_threads';
import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';

type Model = Awaited<ReturnType<typeof nsfwjs.load>>;
let model: Promise<Model> | null = null;

function getModel(): Promise<Model> {
  if (!model) {
    model = (async () => {
      await tf.setBackend('cpu');
      // The mid-size MobileNet that ships inside the package: no download,
      // no network, nothing leaves the server.
      return nsfwjs.load('MobileNetV2Mid', { type: 'graph' });
    })();
    model.catch(() => { model = null; });   // let a later call retry
  }
  return model;
}

parentPort?.on('message', async (msg: { id: number; pixels: Uint8Array; size: number }) => {
  try {
    const m = await getModel();
    const img = tf.tensor3d(msg.pixels, [msg.size, msg.size, 3], 'int32');
    const preds = await m.classify(img, 5);
    img.dispose();
    const scores: Record<string, number> = {};
    for (const p of preds) scores[p.className.toLowerCase()] = Math.round(p.probability * 1000) / 1000;
    parentPort!.postMessage({ id: msg.id, scores });
  } catch (err) {
    parentPort!.postMessage({ id: msg.id, error: (err as Error).message });
  }
});
