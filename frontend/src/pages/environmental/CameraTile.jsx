import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { envRiskApi } from "../../lib/envRiskApi.js";

// Shows the YOLO-annotated MJPEG stream proxied by the Flask backend.
export default function CameraTile({ device }) {
  const cam = device.camera || {};
  const online = device.status === "ONLINE";
  const [imgFailed, setImgFailed] = useState(false);

  // if frames stop and come back, try the <img> again
  useEffect(() => {
    if (cam.has_frame) setImgFailed(false);
  }, [cam.has_frame, cam.error]);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Camera size={18} className="text-sky-600" /> {device.device_id}
          </h3>
          <p className="text-sm text-slate-500">
            Zone: {device.zone_id || "-"}
            {device.ip ? ` • ${device.ip}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${online ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-slate-900">
        {cam.has_frame && !imgFailed ? (
          <img
            src={envRiskApi.streamUrl(device.device_id)}
            alt={`Live view from ${device.device_id}`}
            className="aspect-[4/3] w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-slate-300">
            Waiting for annotated camera frames…
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">YOLO FPS</p>
          <p className="font-semibold text-ink">{cam.fps ?? 0}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Detections</p>
          <p className="font-semibold text-ink">{cam.detections ?? 0}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Frame</p>
          <p className="font-semibold text-ink">{cam.frame_time ? cam.frame_time.slice(11, 19) : "-"}</p>
        </div>
      </div>
      {cam.error && <p className="mt-2 text-xs text-slate-500">Camera worker: {cam.error}</p>}
    </div>
  );
}
