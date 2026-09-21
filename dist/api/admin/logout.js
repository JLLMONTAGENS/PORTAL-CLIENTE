module.exports=async function handler(req,res){res.setHeader('Set-Cookie','jll_admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return res.status(200).json({ok:true})};
