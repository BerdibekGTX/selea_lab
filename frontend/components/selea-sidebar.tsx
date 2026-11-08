"use client";
import Link from "next/link";
import {Dialog, Modal, ModalOverlay} from "react-aria-components";
import {RiAddLine, RiBarChartBoxLine, RiBox3Line, RiChat3Line, RiSettings4Line, RiShieldCheckLine, RiUserLine, RiArrowRightSLine} from "@remixicon/react";
import {DashboardSidebar, type DashboardNavItem} from "./boardui-kit/application/dashboard/dashboard-sidebar";
import {categories} from "../app/leaderboard";

type Props={
  history:{id:string;title:string}[]; activeChatId:string|null;
  board:boolean; modelPage:boolean; category:string; busy:boolean;
  userName?:string; onNewChat:()=>void; onSettings:()=>void; onAccount:()=>void; onPrivacy:()=>void;
  expanded:boolean; onExpandedChange:(expanded:boolean)=>void;
  mobileOpen:boolean; onMobileClose:()=>void;
};
export function SeleaSidebar(props:Props){
  const action=(callback:()=>void)=>()=>{props.onMobileClose();callback()};
  const items:DashboardNavItem[]=[
    {key:"new",label:"New chat",icon:RiAddLine,onClick:action(props.onNewChat),disabled:props.busy},
    {key:"leaderboard",label:"Leaderboard",icon:RiBarChartBoxLine,href:"/leaderboard",onClick:props.onMobileClose},
    {key:"models",label:"Models",icon:RiBox3Line,href:"/models",onClick:props.onMobileClose},
  ];
  const secondaryItems:DashboardNavItem[]=[
    {key:"settings",label:"Settings",icon:RiSettings4Line,onClick:action(props.onSettings)},
    {key:"privacy",label:"Privacy and data",icon:RiShieldCheckLine,onClick:action(props.onPrivacy)},
  ];
  const headerSlot=(collapsed:boolean)=><Link href="/" className="bui-workspace" aria-label="Selea home" onClick={props.onMobileClose}>
    <span className="bui-workspace-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h15v5H6zM3 9h15v6H3zM0 16h15v5H0z" fill="currentColor"/></svg></span>
    {!collapsed&&<span className="bui-workspace-name">selea</span>}
  </Link>;
  const footerSlot=(collapsed:boolean)=><button className={"bui-account "+(collapsed?"is-collapsed":"")} onClick={action(props.onAccount)} aria-label={props.userName?"Account settings":"Log in"} title={collapsed?(props.userName??"Log in"):undefined}>
    <span className="bui-account-avatar">{props.userName?props.userName.slice(0,1).toUpperCase():<RiUserLine size={18}/>}</span>
    {!collapsed&&<><span className="bui-account-copy"><strong>{props.userName??"Log in"}</strong><small>{props.userName?"Your workspace":"Local workspace"}</small></span><RiArrowRightSLine size={16}/></>}
  </button>;
  const contentSlot=(collapsed:boolean)=>collapsed?null:<div className="bui-resources">
    {props.board&&<div className="bui-categories">
      <p className="bui-label">Rankings</p>
      <Link href="/leaderboard" aria-current={props.category==="overview"?"page":undefined} onClick={props.onMobileClose}>Overview</Link>
      {["Agent","Chat","Code","Image","Video"].map(group=><details key={group+props.category} open={categories.some(c=>c.group===group&&c.id===props.category)}>
        <summary>{group}<RiArrowRightSLine size={14}/></summary>
        {categories.filter(c=>c.group===group).map(c=><Link href={"/leaderboard/"+c.id} key={c.id} aria-current={props.category===c.id?"page":undefined} onClick={props.onMobileClose}>{c.label}</Link>)}
      </details>)}
    </div>}
    <p className="bui-label">Conversations {props.history.length>0&&<span>{props.history.length}</span>}</p>
    {props.history.length?props.history.map(chat=><Link className="bui-chat" href={"/chat/"+chat.id} key={chat.id} title={chat.title} onClick={props.onMobileClose} aria-current={props.activeChatId===chat.id?"page":undefined}><RiChat3Line size={17}/><span>{chat.title}</span></Link>):<p className="bui-empty">Your conversations will appear here.</p>}
  </div>;
  const sidebar=(mobile=false)=><DashboardSidebar
    mobile={mobile} onClose={props.onMobileClose}
    collapsed={!props.expanded} onCollapsedChange={value=>props.onExpandedChange(!value)}
    selected={props.board?"leaderboard":props.modelPage?"models":props.activeChatId?"":"new"}
    items={items} secondaryItems={secondaryItems} showSearch={false} showThemeToggle={false}
    headerSlot={headerSlot} footerSlot={footerSlot} contentSlot={contentSlot}
    className="bui-sidebar"
  />;
  return <>
    <div className="bui-desktop-sidebar">{sidebar()}</div>
    <ModalOverlay isOpen={props.mobileOpen} onOpenChange={open=>{if(!open)props.onMobileClose()}} isDismissable className="bui-drawer-overlay">
      <Modal className="bui-drawer"><Dialog aria-label="Workspace menu" className="bui-drawer-dialog">{sidebar(true)}</Dialog></Modal>
    </ModalOverlay>
  </>;
}
