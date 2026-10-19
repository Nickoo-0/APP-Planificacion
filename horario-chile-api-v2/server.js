'use strict';
const http=require('http'),fs=require('fs'),path=require('path');const {URL}=require('url');
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data', 'config.json');
const PUBLIC = path.join(__dirname, 'public');
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function loadConfig(){const c=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));if(!Array.isArray(c.exceptions))c.exceptions=[];return c}
function saveConfig(c){const t=DATA_FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(c,null,2));fs.renameSync(t,DATA_FILE)}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
function localParts(date,timeZone){const a=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);const p=Object.fromEntries(a.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,dateTime:`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`,day:{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[p.weekday]}}
function toMinutes(v){const[h,m]=v.split(':').map(Number);return h*60+m}
function evaluate(c,instant=new Date()){if(Number.isNaN(instant.getTime()))throw new Error('Fecha inválida');const l=localParts(instant,c.timeZone),current=toMinutes(l.time);const exceptions=(c.exceptions||[]).filter(e=>e.date===l.date);const fullClose=exceptions.find(e=>e.type==='CLOSE_DAY');const partialClose=exceptions.find(e=>e.type==='CLOSE'&&current>=toMinutes(e.start)&&current<toMinutes(e.end));const specialOpen=exceptions.find(e=>e.type==='OPEN'&&current>=toMinutes(e.start)&&current<toMinutes(e.end));const holiday=c.holidays.find(h=>h.date===l.date);const intervals=c.weekly[String(l.day)]||[];const active=intervals.find(i=>current>=toMinutes(i.start)&&current<toMinutes(i.end));let open=false,reason='OUTSIDE_BUSINESS_HOURS',flow='Cerrado_Hora',exception=null;if(fullClose){reason='SPECIAL_CLOSURE_DAY';flow='Cerrado_Excepcion';exception=fullClose}else if(partialClose){reason='SPECIAL_CLOSURE';flow='Cerrado_Excepcion';exception=partialClose}else if(specialOpen){open=true;reason='SPECIAL_OPENING';flow='Horario_OK';exception=specialOpen}else if(holiday){reason='HOLIDAY';flow='Cerrado_Feriado'}else if(active){open=true;reason='OPEN';flow='Horario_OK'}else if(l.day===0||l.day===6){reason='WEEKEND';flow='Cerrado_FinDeSemana'}return{isOpen:open,esHorarioHabil:open?'true':'false',flujoActivo:flow,reason,localDate:l.date,localTime:l.time,localDateTime:l.dateTime,timeZone:c.timeZone,holiday:holiday||null,exception,activeInterval:active||null}}
function validTime(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)}
function validate(c){if(!c||typeof c.name!=='string'||c.timeZone!=='America/Santiago')return'Configuración inválida';if(!c.weekly||!Array.isArray(c.holidays)||!Array.isArray(c.exceptions))return'Faltan weekly, holidays o exceptions';for(let d=0;d<=6;d++){if(!Array.isArray(c.weekly[String(d)]))return`Día ${d} inválido`;for(const i of c.weekly[String(d)])if(!validTime(i.start)||!validTime(i.end)||toMinutes(i.start)>=toMinutes(i.end))return`Intervalo inválido en día ${d}`}for(const h of c.holidays)if(!/^\d{4}-\d{2}-\d{2}$/.test(h.date)||!h.name)return'Feriado inválido';for(const e of c.exceptions){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!e.name||!['CLOSE_DAY','CLOSE','OPEN'].includes(e.type))return'Excepción inválida';if(e.type!=='CLOSE_DAY'&&(!validTime(e.start)||!validTime(e.end)||toMinutes(e.start)>=toMinutes(e.end)))return'Horario de excepción inválido'}return null}
function authorized(req) {
    if (!ADMIN_USER || !ADMIN_PASSWORD) {
        return false;
    }

    var authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Basic ')) {
        return false;
    }

    try {
        var credentials = Buffer
            .from(authorization.substring(6), 'base64')
            .toString('utf8');

        var separator = credentials.indexOf(':');

        if (separator === -1) {
            return false;
        }

        var user = credentials.substring(0, separator);
        var password = credentials.substring(separator + 1);

        return user === ADMIN_USER &&
               password === ADMIN_PASSWORD;

    } catch (error) {
        return false;
    }
}

function requestAuthentication(res) {
    res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Administracion Horarios"',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });

    res.end(JSON.stringify({
        error: 'Usuario o contraseña incorrectos'
    }));
}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',d=>{s+=d;if(s.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
function staticFile(req,res,urlPath){const file=urlPath==='/'?'index.html':urlPath.slice(1),safe=path.normalize(file).replace(/^(\.\.[/\\])+/,'');const full=path.join(PUBLIC,safe);if(!full.startsWith(PUBLIC)||!fs.existsSync(full)||fs.statSync(full).isDirectory())return false;const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'}[path.extname(full)]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(full));return true}
const server = http.createServer(async (req, res) => {
    const url = new URL(
        req.url,
        `http://${req.headers.host || 'localhost'}`
    );

    try {
        /*
         * Endpoint público para Lynn.
         */
        if (
            req.method === 'GET' &&
            url.pathname === '/api/status'
        ) {
            const at = url.searchParams.get('at');

            return json(
                res,
                200,
                evaluate(
                    loadConfig(),
                    at ? new Date(at) : new Date()
                )
            );
        }

        /*
         * Todo lo demás requiere autenticación.
         */
        if (!authorized(req)) {
            return requestAuthentication(res);
        }

        /*
         * Obtener configuración desde la administración.
         */
        if (
            req.method === 'GET' &&
            url.pathname === '/api/config'
        ) {
            return json(res, 200, loadConfig());
        }

        /*
         * Guardar configuración desde la administración.
         */
        if (
            req.method === 'PUT' &&
            url.pathname === '/api/config'
        ) {
            const config = await body(req);
            const error = validate(config);

            if (error) {
                return json(res, 400, {
                    error: error
                });
            }

            saveConfig(config);

            return json(res, 200, {
                ok: true,
                config: config
            });
        }

        /*
         * Interfaz administrativa protegida.
         */
        if (
            req.method === 'GET' &&
            staticFile(req, res, url.pathname)
        ) {
            return;
        }

        json(res, 404, {
            error: 'No encontrado'
        });

    } catch (error) {
        json(res, 500, {
            error: error.message
        });
    }
});
console.log('SERVIDOR PROTEGIDO V2');
console.log('ADMIN_USER configurado:', Boolean(ADMIN_USER));
console.log('ADMIN_PASSWORD configurada:', Boolean(ADMIN_PASSWORD));
if(require.main===module)server.listen(PORT,HOST,()=>console.log(`Horario Chile API: http://localhost:${PORT}`));module.exports={evaluate,validate,loadConfig};
