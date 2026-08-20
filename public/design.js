const grid=document.querySelector("#media"),dialog=document.querySelector("dialog"),viewer=document.querySelector("#viewer");

function layout(count){
  if(!count)return[];
  const tiles=[{index:0,depth:0,x:0,y:0,width:1,height:1}];
  for(let index=1;index<count;index++){
    const tile=tiles.reduce((a,b)=>b.depth<a.depth||b.depth===a.depth&&b.index<a.index?b:a);
    const next={index,depth:tile.depth+1,x:tile.x,y:tile.y,width:tile.width,height:tile.height};
    if(tile.depth%2===0){
      tile.width/=2;
      next.x+=tile.width;
      next.width=tile.width;
    }else{
      tile.height/=2;
      next.y+=tile.height;
      next.height=tile.height;
    }
    tile.depth++;
    tiles.push(next);
  }
  return tiles;
}

function update(){
  const items=[...grid.children];
  for(const tile of layout(items.length)){
    const style=items[tile.index].style;
    style.setProperty("--x",tile.x*100+"%");
    style.setProperty("--y",tile.y*100+"%");
    style.setProperty("--width",tile.width*100+"%");
    style.setProperty("--height",tile.height*100+"%");
  }
}

update();
new MutationObserver(update).observe(grid,{childList:true});
grid.onclick=event=>{
  const item=event.target.closest("button[data-kind]");
  if(!item)return;
  if(event.target.closest("audio"))event.preventDefault();
  const preview=item.querySelector("audio");
  if(preview){preview.pause();preview.currentTime=0}
  const kind=item.dataset.kind,media=document.createElement(kind==="file"?"iframe":kind==="image"?"img":kind);
  if(kind==="image")media.alt=item.querySelector("img")?.alt||"";
  else if(kind!=="file"){media.controls=media.autoplay=true;if(kind==="video")media.playsInline=true;if(kind==="audio")media.loop=item.hasAttribute("data-loop")}
  if(kind==="file")media.title="File viewer";
  media.src=item.dataset.src;
  viewer.replaceChildren(media);
  dialog.showModal();
};
document.querySelector("#close").onclick=()=>dialog.close();
dialog.onclose=()=>viewer.replaceChildren();
