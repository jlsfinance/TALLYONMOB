using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

class Program
{
    static async Task TestMain(string[] args)
    {
        var companyName = "MAHESHWARI FOOTWEAR - (from 1-Apr-25)";
        
        var xml = $@"<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Object</TYPE>
    <SUBTYPE>Company</SUBTYPE>
    <ID>{System.Security.SecurityElement.Escape(companyName)}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>";

        Console.WriteLine("Sending request...");
        using var client = new HttpClient();
        var content = new StringContent(xml, Encoding.UTF8, "application/xml");
        var response = await client.PostAsync("http://localhost:9000", content);
        var resXml = await response.Content.ReadAsStringAsync();
        
        System.IO.File.WriteAllText("D:\\tallysyncapp\\company_full_metadata.xml", resXml);
        Console.WriteLine("Saved response to D:\\tallysyncapp\\company_full_metadata.xml length: " + resXml.Length);
    }
}
