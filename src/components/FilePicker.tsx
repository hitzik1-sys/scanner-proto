import type { ReactNode } from 'react';

interface Props {
  onFiles: (files: Blob[]) => void;
  children: ReactNode;
}

/** כפתור שפותח את הגלריה, עם בחירה של כמה תמונות בבת אחת */
export default function FilePicker({ onFiles, children }: Props) {
  return (
    <label className="button">
      {children}
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          onFiles(files);
        }}
      />
    </label>
  );
}
