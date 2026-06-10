import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { CAMERA_ASPECT_RATIO } from "@/lib/camera";

type CameraFrameProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/** Fixed camera aspect ratio container; width is responsive, ratio is not. */
export const CameraFrame = forwardRef<HTMLDivElement, CameraFrameProps>(function CameraFrame(
  { children, className = "", style, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden bg-slate-950 ${className}`.trim()}
      style={{ aspectRatio: CAMERA_ASPECT_RATIO, ...style }}
      {...props}
    >
      {children}
    </div>
  );
});

type CameraImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "width" | "height"> & {
  frameClassName?: string;
};

export function CameraImage({ className = "", frameClassName = "", alt = "", ...props }: CameraImageProps) {
  return (
    <CameraFrame className={frameClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        {...props}
        className={`absolute inset-0 h-full w-full object-contain ${className}`.trim()}
      />
    </CameraFrame>
  );
}

type CameraPlaceholderProps = {
  children: ReactNode;
  className?: string;
};

export function CameraPlaceholder({ children, className = "" }: CameraPlaceholderProps) {
  return (
    <CameraFrame
      className={`flex items-center justify-center bg-slate-100 text-sm text-slate-500 ${className}`.trim()}
    >
      <div className="absolute inset-0 flex items-center justify-center p-4 text-center">{children}</div>
    </CameraFrame>
  );
}
