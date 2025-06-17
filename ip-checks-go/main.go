package main

import (
	"context"
	"encoding/json"
	"net"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/oschwald/maxminddb-golang"
)

type Restriction struct {
	Category string `db:"category"`
	Scope    string `db:"scope"`
	Value    string `db:"value"`
	Code     *int   `db:"code"`
}
type RestrictionsMap map[string]map[string][]Restriction
type GeoIPInfo struct {
	Country   string
	Continent string
}

func init() {
	godotenv.Load()
}

func isIPInSubnet(ip, subnet string) bool {
	_, ipNet, err := net.ParseCIDR(subnet)
	if err != nil {
		return false
	}
	return ipNet.Contains(net.ParseIP(ip))
}

func getRestrictions(db *sqlx.DB, rdb *redis.Client) RestrictionsMap {
	data, err := rdb.Get(context.Background(), "restrictions").Result()
	if err == nil {
		var restrictions RestrictionsMap
		if json.Unmarshal([]byte(data), &restrictions) == nil {
			return restrictions
		}
	}

	var rows []Restriction
	err = db.Select(&rows, "SELECT category, scope, value, code FROM restrictions WHERE state = 'enabled'")
	if err != nil {
		return nil
	}

	restrictions := make(RestrictionsMap)
	for _, cat := range []string{"whitelist", "maintenance", "blacklist", "blocklogin"} {
		restrictions[cat] = make(map[string][]Restriction)
		for _, scope := range []string{"all", "ip", "ip_subnet", "continent", "country"} {
			restrictions[cat][scope] = []Restriction{}
		}
	}

	for _, r := range rows {
		restrictions[r.Category][r.Scope] = append(restrictions[r.Category][r.Scope], r)
	}

	cacheData, _ := json.Marshal(restrictions)
	rdb.Set(context.Background(), "restrictions", cacheData, 5*time.Minute)
	return restrictions
}

func getGeoIP(geoipDB *maxminddb.Reader, ip string) GeoIPInfo {
	info := GeoIPInfo{}
	ipAddr := net.ParseIP(ip)
	if ipAddr == nil {
		return info
	}

	var record struct {
		Country struct {
			ISOCode string `maxminddb:"iso_code"`
		} `maxminddb:"country"`
		Continent struct {
			Code string `maxminddb:"code"`
		} `maxminddb:"continent"`
	}
	if err := geoipDB.Lookup(ipAddr, &record); err == nil {
		info.Country = record.Country.ISOCode
		info.Continent = record.Continent.Code
	}
	return info
}

func findRestriction(category, ip string, info GeoIPInfo, restrictions RestrictionsMap) *Restriction {
	for _, r := range restrictions[category]["all"] {
		return &r
	}
	for _, r := range restrictions[category]["ip"] {
		if r.Value == ip {
			return &r
		}
	}
	for _, r := range restrictions[category]["ip_subnet"] {
		if isIPInSubnet(ip, r.Value) {
			return &r
		}
	}
	for _, r := range restrictions[category]["continent"] {
		if strings.EqualFold(r.Value, info.Continent) {
			return &r
		}
	}
	for _, r := range restrictions[category]["country"] {
		if strings.EqualFold(r.Value, info.Country) {
			return &r
		}
	}
	return nil
}

func restrict(db *sqlx.DB, rdb *redis.Client, geoipDB *maxminddb.Reader) gin.HandlerFunc {
	return func(c *gin.Context) {

		ip := c.GetHeader("X-Real-IP")
		if ip == "" {
			ip = c.ClientIP()
		}

		info := getGeoIP(geoipDB, ip)
		restrictions := getRestrictions(db, rdb)
		if restrictions == nil {
			c.JSON(500, gin.H{"error": "server error"})
			c.Abort()
			return
		}

		for _, category := range []string{"whitelist", "maintenance", "blacklist", "blocklogin"} {
			if r := findRestriction(category, ip, info, restrictions); r != nil {
				code := 403
				if r.Code != nil {
					code = *r.Code
				}
				if category == "whitelist" {
					c.Next()
					return
				}
				if category == "blacklist" || category == "maintenance" {
					c.JSON(code, gin.H{"error": "restrict." + category})
					c.Abort()
					return
				}
				if category == "blocklogin" {
					c.JSON(code, gin.H{"error": "restrict." + category})
					c.Abort()
					return
				}
			}
		}
		c.Next()
	}
}

func main() {
	db, err := sqlx.Connect("postgres", os.Getenv("DB_URL"))
	if err != nil {
		panic("cannot connect to database")
	}
	defer db.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr: os.Getenv("REDIS_URL"),
	})
	defer rdb.Close()

	geoipDB, err := maxminddb.Open(os.Getenv("GEOIP_DB"))
	if err != nil {
		panic("cannot open GeoIP database")
	}
	defer geoipDB.Close()

	r := gin.Default()
	r.Use(restrict(db, rdb, geoipDB))

	r.Run(":8080")
}
