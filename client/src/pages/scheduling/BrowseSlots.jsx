// [S1] BrowseSlots: Student searches/filters slots; non-clashing first, holidays excluded (#1)
import PageHeader from '@/components/PageHeader';

export default function BrowseSlots() {
  return (
    <>
      <PageHeader eyebrow="Book a slot" title="Find office hours that fit your timetable" description="Pick a module, then an instructor, then a slot. Slots that clash with your classes show last." />
      <div className="todo stack">
        <span className="hand">S1 builds this page next</span>
        <p className="muted">API: getModules, getInstructors, getSlots (api/scheduling.js)</p>
        <p className="muted">Uses: React Bits Folder (modules, book mode) and Lanyard (instructors)</p>
      </div>
    </>
  );
}
