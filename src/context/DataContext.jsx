// context/DataContext.jsx
//
// THE single source of truth for अध्याय (chapters), पाठ (lessons), and
// सामग्री (materials) — and THE single door for every operation on them
// (create, rename, delete, upload, tag/re-tag).
//
// Before this, App.jsx held these three lists in its own state and passed
// them down through props to every screen that needed them (Planner,
// Materials, Question Bank, Activities, Assessment, Home, ...), along with a
// matching refresh callback for each (onAddChapter, onChaptersChanged,
// onLessonsChanged, onMaterialsChanged). Every screen that mutated data had
// to remember to call the right callback, and several forgot at different
// times — that mismatch was the direct cause of most of the "created here,
// doesn't show up there" bugs (materials not appearing in the Planner,
// Paths not appearing in Materials, chapter counts going stale, etc).
//
// Any screen anywhere in the app now does:
//   import { useData } from "../context/DataContext";
//   const { chapters, lessons, materials, addChapter, uploadMaterial, ... } = useData();
// No props, no refresh callbacks to wire up, no possibility of a screen
// holding a stale copy — there is only ever one copy, and every mutation
// updates it directly.
import { createContext, useContext } from "react";

const DataContext = createContext(null);

// value is built once, in App.jsx, from data that already lives there
// (session/classLabel/currentSection decide what to load) — this file only
// owns the *shape* of that shared object and how screens read it, not the
// loading itself, so there's exactly one loader per list, not two.
export function DataProvider({ value, children }) {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData() must be called inside <DataProvider>");
  return ctx;
}
