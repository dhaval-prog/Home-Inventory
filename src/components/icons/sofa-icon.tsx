import Image from "next/image";
import sofaImage from "../../../public/icons/sofa.png";

export function SofaIcon({ className }: { className?: string }) {
  return <Image src={sofaImage} alt="" className={className} style={{ objectFit: "contain" }} />;
}
