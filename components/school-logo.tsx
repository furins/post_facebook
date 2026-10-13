import Image from "next/image";

type Props = {
  className?: string;
  priority?: boolean;
};

export function SchoolLogo({ className = "", priority = false }: Props) {
  return (
    <span className={`school-logo ${className}`.trim()}>
      <Image
        src="/images/school-logo.png"
        alt="Logo ufficiale dell’IC Badia Trecenta"
        width={512}
        height={512}
        sizes="(max-width: 680px) 42px, 52px"
        priority={priority}
        draggable={false}
      />
    </span>
  );
}
