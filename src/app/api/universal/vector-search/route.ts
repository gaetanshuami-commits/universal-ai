import {
createEmbeddingBatches,
globalVectorStore,
} from "@/lib/universal/rag";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(
request:Request,
){

try{

const body=
await request.json();

const query=
String(
body.query ?? ""
).trim();

if(!query){
return Response.json(
{
error:"query required"
},
{
status:400,
},
);
}

const topK=
Math.max(
1,
Math.min(
Number(
body.topK ?? 5
),
20,
),
);

const embedding=
await createEmbeddingBatches(
[
query,
],
);

const vector=
embedding.embeddings[0].vector;

const results=
globalVectorStore.search(
vector,
topK,
);

return Response.json(
{
query,
topK,
count:
results.length,
results:
results.map(
r=>({
score:r.score,
id:r.item.id,
document:
r.item.chunk.documentName,
chunk:
r.item.chunk.chunkIndex,
text:
r.item.chunk.text,
}),
),
},
);

}
catch(error){

console.error(error);

return Response.json(
{
error:
"Vector search failed",
},
{
status:500,
},
);

}

}

export async function GET(){

return Response.json(
{
indexed:
globalVectorStore.size(),
},
);

}
