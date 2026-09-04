import type { AppData } from '../types';

export function DisclaimerFooter({ data }: { data: AppData }) {
  const d = data.constants.disclaimer;
  return (
    <footer className="mt-auto border-t border-gray-200 bg-gray-50 p-3 text-[10px] leading-relaxed text-gray-500">
      <p className="font-semibold">{d.main}</p>
      <p>{d.substation}</p>
      <p>{d.stats}</p>
      {d.permits && data.permitDelay && <p>{d.permits}</p>}
    </footer>
  );
}
