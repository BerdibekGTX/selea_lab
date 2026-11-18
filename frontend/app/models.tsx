"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {Pagination} from "../components/boardui/pagination";
import {PageHeading} from "../components/boardui/page-heading";
import {ArrowRight, CaretDown, MagnifyingGlass, Scales, X, Cube, ArrowUpRight} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

type Model = {id:string;provider:string};
type CatalogModel = Model & {name:string;context:number|null;output:number|null;input_cost:number|null;output_cost:number|null};
type Score = Model & {wins:number;ties:number;votes:number};
const providers:Record<string,string>={demo:"Selea",openai:"OpenAI",anthropic:"Anthropic",xai:"xAI"};
const accessLabels = { demo: "Free demo", api: "Your API key" };
const keyOf=(model:Model)=>model.provider+"/"+model.id;
const tokens=(value:number|null)=>value===null?"—":Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(value);
const price=(value:number|null)=>value===null?"—":value===0?"Free":"$"+Intl.NumberFormat("en",{maximumFractionDigits:2}).format(value*1_000_000);
const winRate=(score?:Score)=>score?.votes?((score.wins+score.ties*.5)/score.votes*100).toFixed(1)+"%":"—";

export default function Models({configured,ready,onUse,onConfigure}:{configured:Model[];ready:boolean;onUse:(models:Model[])=>void;onConfigure:()=>void}){
  const [catalog,setCatalog]=useState<CatalogModel[]>([]);
  const [scores,setScores]=useState<Score[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const [query,setQuery]=useState("");
  const [providerFilter,setProviderFilter]=useState<string[]>([]);
  const [access,setAccess]=useState<string[]>([]);
  const [sort,setSort]=useState("name");
  const [pageSize,setPageSize]=useState(12);
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<string[]>([]);
  const compare=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    let active=true;
    setLoading(true);setError("");
    const timeout=setTimeout(()=>controller.abort(),12000);
    fetch("/api/models",{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error();
      return response.json() as Promise<{models:CatalogModel[]}>;
    }).then(data=>{if(active)setCatalog(data.models)}).catch(()=>{if(active)setError("The model catalog could not be loaded.")}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false)});
    return ()=>{active=false;controller.abort();clearTimeout(timeout)};
  },[retry]);
  useEffect(()=>{
    if(!ready)return;
    const controller=new AbortController();
    fetch("/api/leaderboard",{signal:controller.signal}).then(r=>r.ok?r.json():[]).then(setScores).catch(()=>{});
    return ()=>controller.abort();
  },[ready]);
  const models=useMemo(()=>{
    const map=new Map(catalog.map(model=>[keyOf(model),model]));
    for(const model of configured)if(model.id.trim()&&!map.has(keyOf(model)))map.set(keyOf(model),{...model,name:model.id,context:null,output:null,input_cost:null,output_cost:null});
    return Array.from(map.values());
  },[catalog,configured]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const result=models.filter(model=>(!q||[model.name,model.id,providers[model.provider],"text chat code",model.provider==="demo"?"demo free":"api key"].join(" ").toLowerCase().includes(q))
      &&(!providerFilter.length||providerFilter.includes(model.provider))
      &&(!access.length||access.includes(model.provider==="demo"?"demo":"api")));
    return result.sort((a,b)=>sort==="context"?(b.context??-1)-(a.context??-1):sort==="cost"?(a.input_cost??Infinity)-(b.input_cost??Infinity):sort==="provider"?a.provider.localeCompare(b.provider)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
  },[models,query,providerFilter,access,sort]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const current=Math.min(page,pages);
  const shown=filtered.slice((current-1)*pageSize,current*pageSize);
  const selectedModels=models.filter(model=>selected.includes(keyOf(model)));
  function reset(){setProviderFilter([]);setAccess([]);setQuery("");setPage(1)}
  function toggle(value:string,values:string[],setter:(values:string[])=>void){setter(values.includes(value)?values.filter(item=>item!==value):[...values,value]);setPage(1)}
  function choose(model:CatalogModel){const key=keyOf(model);setSelected(previous=>previous.includes(key)?previous.filter(id=>id!==key):previous.length<3?[...previous,key]:previous)}
  function openCompare(){compare.current?.showModal()}
  return <section className="models-page">
    <PageHeading className="models-heading" title="Models" description="Find the right model. Compare capabilities, cost, and your results." icon={<Cube size={22}/>}/>
    <section className="models-filter-bar" aria-label="Catalog filters">
      <div className="models-search-row">
        <div className="models-search">
          <MagnifyingGlass size={20} aria-hidden="true"/>
          <input type="search" aria-label="Search models" placeholder="Search by model, provider, or capability…"
            value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/>
          {query && <button aria-label="Clear search" onClick={()=>{setQuery("");setPage(1)}}><X size={16}/></button>}
        </div>
        <button className="models-compare" onClick={openCompare}><Scales size={19}/>Compare Models{selected.length>0&&<span>{selected.length}</span>}</button>
      </div>
      <div className="models-filter-options">
        <ModelFilter label="Provider" options={providers} values={providerFilter}
          onToggle={id => toggle(id, providerFilter, setProviderFilter)}/>
        <ModelFilter label="Access" options={accessLabels} values={access}
          onToggle={id => toggle(id, access, setAccess)}/>
        <div className="models-filter-chips" aria-label="Active filters">
          {providerFilter.map(id => <button type="button" key={id} aria-label={`Remove ${providers[id]} filter`}
            onClick={() => toggle(id, providerFilter, setProviderFilter)}>{providers[id]}<X size={12}/></button>)}
          {access.map(id => {
            const label = accessLabels[id as keyof typeof accessLabels];
            return <button type="button" key={id} aria-label={`Remove ${label} filter`}
              onClick={() => toggle(id, access, setAccess)}>{label}<X size={12}/></button>;
          })}
        </div>
        {(query || providerFilter.length > 0 || access.length > 0) &&
          <Button variant="ghost" size="sm" onClick={reset}>Clear all</Button>}
        <Button className="models-connect" variant="ghost" size="sm" onClick={onConfigure}>Connect models<ArrowUpRight size={14}/></Button>
      </div>
    </section>
    <div className="models-results">
        <div className="models-toolbar"><p aria-live="polite">{loading?"Loading models…":`Showing ${filtered.length?(current-1)*pageSize+1:0}–${Math.min(current*pageSize,filtered.length)} of ${filtered.length}`}</p><label>Sort: <select aria-label="Sort models" value={sort} onChange={e=>{setSort(e.target.value);setPage(1)}}><option value="name">Name</option><option value="provider">Provider</option><option value="context">Context window</option><option value="cost">Lowest input cost</option></select></label><label>Per page: <select aria-label="Results per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>{[6,12,24].map(size=><option key={size}>{size}</option>)}</select></label></div>
        {selected.length>0&&<div className="models-selection"><span>{selected.length} of 3 selected</span><button onClick={()=>setSelected([])}>Clear</button><button onClick={openCompare}>Compare selection<ArrowRight size={14}/></button></div>}
        {error?<div className="models-empty" role="alert"><p>{error}</p><button className="secondary" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:loading?<div className="models-grid" aria-hidden="true">{[0,1,2,3].map(i=><div className="model-skeleton" key={i}/>)}</div>:<div className="models-grid">
          {shown.map(model=>{const score=scores.find(score=>keyOf(score)===keyOf(model));const chosen=selected.includes(keyOf(model));return <article className={"catalog-card "+(chosen?"is-selected":"")} key={keyOf(model)}>
            <header><span className={"catalog-mark "+model.provider}>{model.provider==="demo"?<Cube size={20}/>:model.provider==="xai"?"x":model.provider==="anthropic"?"A":"O"}</span><div><h2>{model.name}</h2><p>{providers[model.provider]??model.provider}</p></div><span className={"catalog-badge "+(model.provider==="demo"?"demo":"")}>{model.provider==="demo"?"Demo":"Text"}</span></header>
            <dl><div><dt>Your win rate</dt><dd>{winRate(score)}</dd></div><div><dt>Votes</dt><dd>{score?.votes??0}</dd></div><div><dt>Input / 1M tokens</dt><dd>{price(model.input_cost)}</dd></div><div><dt>Output / 1M tokens</dt><dd>{price(model.output_cost)}</dd></div><div><dt>Context window</dt><dd>{tokens(model.context)}</dd></div><div><dt>Max output tokens</dt><dd>{tokens(model.output)}</dd></div></dl>
            <div className="catalog-tags"><span>Arenas</span><span className="tag">Chat</span><span className="tag">Code</span><span className="catalog-access">{model.provider==="demo"?"Simulated responses":"API key required"}</span></div>
            <footer><label><input type="checkbox" aria-label={"Compare "+model.name} checked={chosen} disabled={!chosen&&selected.length>=3} onChange={()=>choose(model)}/>{chosen?"Selected":"Compare"}</label><button onClick={()=>onUse([model])}>Try in chat<ArrowRight size={14}/></button></footer>
          </article>})}
        </div>}
        {!loading&&!error&&!shown.length&&<div className="models-empty"><MagnifyingGlass size={30}/><h2>No models found</h2><p>Try a different search or clear your filters.</p><button className="secondary" onClick={reset}>Clear filters</button></div>}
        {!loading&&!error&&pages>1&&<Pagination page={current} totalPages={pages} onChange={setPage}/>}
        <p className="models-disclaimer">Prices and token limits come from the installed LiteLLM catalog and may change. Availability depends on your provider account. Win rates reflect only your votes; unranked models show —.</p>
    </div>
    <dialog ref={compare} className="models-comparison" onClick={e=>{if(e.target===e.currentTarget)compare.current?.close()}}><div className="dialog-content"><header><h2>Compare models</h2><button className="icon" aria-label="Close model comparison" onClick={()=>compare.current?.close()}><X size={20}/></button></header>
      {selectedModels.length<2?<div className="models-empty"><Scales size={32}/><h3>Select two or three models</h3><p>Use the Compare checkbox on each model card to see them side by side.</p><button className="primary" onClick={()=>compare.current?.close()}>Choose models</button></div>:<><div className="models-comparison-scroll"><table><thead><tr><th>Model</th>{selectedModels.map(model=><th key={keyOf(model)}>{model.name}</th>)}</tr></thead><tbody>{[
        ["Provider",...selectedModels.map(model=>providers[model.provider])],
        ["Input / 1M tokens",...selectedModels.map(model=>price(model.input_cost))],
        ["Output / 1M tokens",...selectedModels.map(model=>price(model.output_cost))],
        ["Context window",...selectedModels.map(model=>tokens(model.context))],
        ["Max output tokens",...selectedModels.map(model=>tokens(model.output))],
        ["Your win rate",...selectedModels.map(model=>winRate(scores.find(score=>keyOf(score)===keyOf(model))))],
        ["Access",...selectedModels.map(model=>model.provider==="demo"?"Free demo":"Your API key")],
      ].map(([label,...values])=><tr key={label}><th scope="row">{label}</th>{values.map((value,index)=><td key={index}>{value}</td>)}</tr>)}</tbody></table></div><p>{selectedModels.length===2?"Start a side-by-side chat with these two models. Provider models require your API keys in Settings.":"Compare up to three specifications here. Select exactly two models to start a side-by-side chat."}</p><button className="primary" disabled={selectedModels.length!==2} onClick={()=>{compare.current?.close();onUse(selectedModels)}}>Start comparison<ArrowRight size={16}/></button></>}
    </div></dialog>
  </section>;
}

function ModelFilter({ label, options, values, onToggle }: {
  label: string;
  options: Record<string, string>;
  values: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">{label}<CaretDown size={13}/></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(options).map(([id, name]) => (
          <DropdownMenuCheckboxItem key={id} checked={values.includes(id)}
            onSelect={event => event.preventDefault()} onCheckedChange={() => onToggle(id)}>
            {name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
