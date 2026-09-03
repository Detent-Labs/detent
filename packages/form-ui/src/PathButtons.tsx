import type { AvailablePath } from "./types.js";

interface PathButtonsProps {
  paths: AvailablePath[];
  onSubmit: (pathId: string) => void;
  loading?: boolean;
}

/** One submit action per `availablePaths` entry; none when the list is empty
 * (a wait-state with no currently-matching manual path renders read-only). */
export function PathButtons({ paths, onSubmit, loading }: PathButtonsProps) {
  if (paths.length === 0) return null;
  return (
    <div className="form-ui-paths">
      {paths.map((path) => (
        <button key={path.id} type="button" className="btn btn-primary" disabled={loading} onClick={() => onSubmit(path.id)}>
          {path.label ?? path.key}
        </button>
      ))}
    </div>
  );
}
