import type {ReactNode} from "react";

/** Shared heading for every Selea workspace page. */
export function PageHeading({title,description,icon,className=""}:{title:string;description:string;icon:ReactNode;className?:string}){
  return <header className={"page-heading bui-page-heading "+className}>
    <div className="bui-heading-title"><span className="bui-heading-icon" aria-hidden="true">{icon}</span><h1 className="page-title">{title}</h1></div>
    <p className="page-description">{description}</p>
  </header>;
}
