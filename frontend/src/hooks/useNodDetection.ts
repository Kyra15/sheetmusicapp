import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { NodDetector, configForSensitivity } from "./nodDetector";

// Google's hosted CDN copies of the WASM runtime + pretrained model. These
// are fetched by the browser at runtime (not bundled), same pattern MediaPipe's
// own docs use. Pin versions so a model update upstream can't change behavior
// under us mid-performance.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Landmark indices from MediaPipe's 478-point face mesh topology.
const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;

export type NodDetectionStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "running"
  | "no-face"
  | "error";

interface UseNodDetectionOptions {
  /** 0-1, see nodDetector.ts configForSensitivity */
  sensitivity: number;
  onNod: () => void;
  /** starts/stops the camera + detection loop */
  active: boolean;
}

export function useNodDetection({ sensitivity, onNod, active }: UseNodDetectionOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<NodDetectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** how "primed" the current gesture is, 0-1, purely for the on-screen ring UI */
  const [gestureProgress, setGestureProgress] = useState(0);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef(new NodDetector(configForSensitivity(sensitivity)));
  const rafRef = useRef<number | null>(null);
  const onNodRef = useRef(onNod);
  onNodRef.current = onNod;

  useEffect(() => {
    detectorRef.current.setConfig(configForSensitivity(sensitivity));
  }, [sensitivity]);

  const signalFromLandmarks = useCallback((landmarks: NormalizedLandmark[]) => {
    const nose = landmarks[NOSE_TIP];
    const leftEye = landmarks[LEFT_EYE_OUTER];
    const rightEye = landmarks[RIGHT_EYE_OUTER];
    const interocular = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
    if (interocular < 1e-6) return null;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    return (nose.y - eyeMidY) / interocular;
  }, []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function start() {
      try {
        setErrorMessage(null);
        setStatus("requesting-camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus("loading-model");
        if (!landmarkerRef.current) {
          const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
          landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            numFaces: 1,
          });
        }
        if (cancelled) return;

        detectorRef.current.reset();
        setStatus("running");

        const loop = () => {
          const video = videoRef.current;
          const landmarker = landmarkerRef.current;
          if (!video || !landmarker || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
          const result = landmarker.detectForVideo(video, performance.now());
          const face = result.faceLandmarks?.[0];
          if (!face) {
            setStatus("no-face");
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
          setStatus("running");
          const signal = signalFromLandmarks(face);
          if (signal !== null) {
            const nodded = detectorRef.current.update(signal, performance.now());
            // rough visual feedback: how close are we to the trigger threshold
            setGestureProgress((prev) => {
              const target = Math.min(1, Math.max(0, signal * 6));
              return prev + (target - prev) * 0.3;
            });
            if (nodded) {
              onNodRef.current();
              setGestureProgress(0);
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        console.error("Nod detection failed to start", err);
        setStatus("error");
        setErrorMessage(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access to use Playing Mode."
            : "Couldn't start the camera or face model. Check your connection and try again."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus("idle");
      setGestureProgress(0);
    };
  }, [active, signalFromLandmarks]);

  // release the (expensive) landmarker model when the hook's owner unmounts entirely
  useEffect(() => {
    return () => {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return { videoRef, status, errorMessage, gestureProgress };
}
